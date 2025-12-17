import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Platform } from 'react-native';
import { useHistory } from '../context/HistoryContext';
import axios from 'axios';

export default function UploadScreen({ navigation }) {
  const { addHistoryItem } = useHistory();

  const [selectedFile, setSelectedFile] = React.useState(null);
  const [analyzing, setAnalyzing] = React.useState(false);

  // Use 10.0.2.2 for Android Emulator, localhost for iOS Simulator
  const API_HOST = Platform.select({
    android: 'http://10.0.2.2:4200',
    ios: 'http://localhost:4200',
    default: 'http://localhost:4200',
  });

  // Set to FALSE to use your real backend logic
  const DEV_MOCK = false;

  const requestStoragePermission = async () => {
    try {
      if (Platform.OS === 'android') {
        // Modern Android (10+) often doesn't need this for DocumentPicker, 
        // but older versions might.
        if (Platform.Version >= 33) return true; // Android 13+ handles media permissions differently
        
        const result = await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
        return result === RESULTS.GRANTED;
      }
      return true; // iOS handles this automatically
    } catch (error) {
      console.error('Permission error:', error);
      return false;
    }
  };

  const handleFileUpload = async () => {
    const hasPermission = await requestStoragePermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Storage permission is required to select files.');
      return;
    }

    try {
      const res = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.pdf, DocumentPicker.types.images],
        copyTo: 'cachesDirectory',
      });
      setSelectedFile(res);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        console.error('Picker Error:', err);
        Alert.alert('Error', 'Failed to pick file.');
      }
    }
  };

  const handleBeginAnalysis = async () => {
    if (!selectedFile) {
      Alert.alert('No File', 'Please select a file first.');
      return;
    }

    setAnalyzing(true);

    try {
      const formData = new FormData();

      // --- URI Normalization ---
      let fileUri = selectedFile.fileCopyUri || selectedFile.uri;
      if (Platform.OS === 'ios' && !fileUri.startsWith('file://')) {
        fileUri = `file://${fileUri}`;
      }

      const mimeType = selectedFile.type || 'application/octet-stream';
      
      formData.append('file', {
        uri: fileUri,
        type: mimeType,
        name: selectedFile.name || 'upload.bin',
      });

      // 1. Upload & Analyze (One-Shot)
      // We use the /api/upload/ route which now runs the full Preprocess Pipeline
      const uploadUrl = `${API_HOST}/api/upload/?mock=${DEV_MOCK ? '1' : '0'}`;
      console.log(`Uploading to: ${uploadUrl}`);
      
      const response = await axios.post(uploadUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000, // 60 sec timeout for heavy AI operations
      });

      const data = response.data;
      if (data.status !== 'ok') throw new Error(data.error || 'Upload failed');

      // 2. Extract Data
      const preprocess = data.preprocess || {};
      const storedName = data.file?.stored_name;
      const imageUrl = `${API_HOST}/static/uploads/${storedName}`; // Construct full URL
      
      // Determine Analysis Result (Image vs PDF logic)
      let aiSummary = "";
      let arElements = [];
      let fileMeta = {};

      if (preprocess.kind === 'image') {
        aiSummary = preprocess.ai?.answer || preprocess.vision?.answer || "";
        arElements = preprocess.ar?.elements || [];
        fileMeta = preprocess.meta || {}; // Contains width/height
      } else {
        // PDF
        aiSummary = preprocess.ai_final?.answer || preprocess.ai_initial?.answer || "";
        arElements = preprocess.ar?.elements || [];
      }

      // 3. Save to History
      const historyItem = {
        id: Date.now().toString(),
        name: selectedFile.name,
        uri: fileUri,
        type: selectedFile.type,
        date: new Date().toISOString(),
        
        // Critical Data for Re-opening
        status: 'completed',
        analysisSummary: aiSummary,
        storedName: storedName, // To re-fetch AR data later
        imageUrl: imageUrl,     // To show in 3D viewer
        arElements: arElements, // The clickable boxes
        fileMeta: fileMeta      // Aspect ratio info
      };
      
      addHistoryItem(historyItem);

      // 4. Navigate to Result (Don't just go Home!)
      Alert.alert(
        'Analysis Complete',
        `Found ${arElements.length} interactive components.`,
        [
          {
            text: 'View Results',
            onPress: () => {
              // Navigate to your Viewer Screen
              // Ensure you have this screen registered in your Navigator!
              navigation.navigate('ARViewer', { 
                data: historyItem // Pass the full object
              });
            }
          }
        ]
      );

    } catch (error) {
      console.error('Analysis Failed:', error);
      Alert.alert('Error', error.response?.data?.error || error.message || 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Upload Document</Text>
      <Text style={styles.subtitle}>
        Upload a schematic or diagram (PDF/Image) to generate an interactive AR analysis.
      </Text>

      <View style={styles.card}>
        <TouchableOpacity style={styles.uploadBox} onPress={handleFileUpload} disabled={analyzing}>
          <Text style={styles.uploadIcon}>📂</Text>
          <Text style={styles.uploadText}>
            {selectedFile ? selectedFile.name : 'Tap to select file'}
          </Text>
        </TouchableOpacity>

        {selectedFile && (
          <TouchableOpacity
            style={[styles.analyzeBtn, analyzing && styles.disabledBtn]}
            onPress={handleBeginAnalysis}
            disabled={analyzing}
          >
            {analyzing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator color="#fff" style={{ marginRight: 10 }} />
                <Text style={styles.btnText}>Processing (this may take 30s)...</Text>
              </View>
            ) : (
              <Text style={styles.btnText}>Analyze & Generate AR</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 How it works</Text>
        <Text style={styles.infoText}>
          1. Our AI scans your diagram.{'\n'}
          2. It identifies components (Valves, Pumps, etc.).{'\n'}
          3. It creates an interactive 3D board you can explore.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#F2F4F8' },
  title: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', marginTop: 20 },
  subtitle: { fontSize: 16, color: '#666', marginTop: 10, marginBottom: 30, lineHeight: 22 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  uploadBox: { borderStyle: 'dashed', borderWidth: 2, borderColor: '#D1D1D6', borderRadius: 12, height: 150, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA' },
  uploadIcon: { fontSize: 40, marginBottom: 10 },
  uploadText: { fontSize: 16, color: '#333', fontWeight: '500' },
  analyzeBtn: { backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  disabledBtn: { backgroundColor: '#A1A1A1' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  infoBox: { marginTop: 30, padding: 20, backgroundColor: '#E3F2FD', borderRadius: 12 },
  infoTitle: { fontSize: 16, fontWeight: '700', color: '#0D47A1', marginBottom: 8 },
  infoText: { fontSize: 14, color: '#1565C0', lineHeight: 20 },
});
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { Platform } from 'react-native';
import { useHistory } from '../context/HistoryContext';
import axios from 'axios';

export default function UploadScreen({ navigation }) {
  // ensure updateHistoryItem is available in your Context Provider
  const { addHistoryItem, updateHistoryItem } = useHistory();

  const [selectedFile, setSelectedFile] = React.useState(null);
  // We keep track of local analyzing state just to prevent double-clicks
  const [isStarting, setIsStarting] = React.useState(false);

  // Use 10.0.2.2 for Android Emulator, localhost for iOS Simulator
  const API_HOST = Platform.select({
    android: 'http://10.0.2.2:4200',
    ios: 'http://localhost:4200',
    default: 'http://localhost:4200',
  });

  const DEV_MOCK = false;

  const requestStoragePermission = async () => {
    try {
      if (Platform.OS === 'android') {
        if (Platform.Version >= 33) return true; 
        const result = await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
        return result === RESULTS.GRANTED;
      }
      return true; 
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

    setIsStarting(true);

    // --- 1. PREPARE DATA ---
    let fileUri = selectedFile.fileCopyUri || selectedFile.uri;
    if (Platform.OS === 'ios' && !fileUri.startsWith('file://')) {
      fileUri = `file://${fileUri}`;
    }
    
    // Generate a unique ID immediately
    const tempId = Date.now().toString();

    // --- 2. CREATE PENDING HISTORY ITEM ---
    const pendingItem = {
      id: tempId,
      name: selectedFile.name,
      uri: fileUri,
      type: selectedFile.type,
      date: new Date().toISOString(),
      status: 'analyzing', // <--- IMPORTANT: UI will show spinner based on this
      progress: 0,
      analysisSummary: null,
      arElements: [],
    };

    // Add to Context immediately
    addHistoryItem(pendingItem);

    // --- 3. NAVIGATE IMMEDIATELY ---
    // User sees the document view while it loads in background
    navigation.navigate('DocView', { item: pendingItem });
    setIsStarting(false); // Reset local button state

    // --- 4. START BACKGROUND ANALYSIS ---
    performBackgroundUpload(tempId, fileUri, selectedFile.type, selectedFile.name);
  };

  // This runs "in the background" even after navigation
  const performBackgroundUpload = async (itemId, uri, type, name) => {
    try {
      const formData = new FormData();
      const mimeType = type || 'application/octet-stream';
      
      formData.append('file', {
        uri: uri,
        type: mimeType,
        name: name || 'upload.bin',
      });

      const uploadUrl = `${API_HOST}/api/upload/?mock=${DEV_MOCK ? '1' : '0'}`;
      
      const response = await axios.post(uploadUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000, 
      });

      const data = response.data;
      if (data.status !== 'ok') throw new Error(data.error || 'Upload failed');

      // Extract Data
      const preprocess = data.preprocess || {};
      const storedName = data.file?.stored_name;
      const imageUrl = `${API_HOST}/static/uploads/${storedName}`;
      
      let aiSummary = "";
      let arElements = [];
      let fileMeta = {};

      if (preprocess.kind === 'image') {
        aiSummary = preprocess.ai?.answer || preprocess.vision?.answer || "";
        arElements = preprocess.ar?.elements || [];
        fileMeta = preprocess.meta || {};
      } else {
        aiSummary = preprocess.ai_final?.answer || preprocess.ai_initial?.answer || "";
        arElements = preprocess.ar?.elements || [];
      }

      // --- 5. UPDATE HISTORY ITEM ON SUCCESS ---
      // This will automatically update the DocView screen via Context
      updateHistoryItem(itemId, {
        status: 'completed',
        analysisSummary: aiSummary,
        storedName: storedName,
        imageUrl: imageUrl,
        arElements: arElements,
        fileMeta: fileMeta
      });

    } catch (error) {
      console.error('Background Analysis Failed:', error);
      
      // --- 6. UPDATE HISTORY ITEM ON FAILURE ---
      updateHistoryItem(itemId, {
        status: 'failed',
        error: error.response?.data?.error || error.message || 'Analysis failed.'
      });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Upload Document</Text>
      <Text style={styles.subtitle}>
        Upload a schematic or diagram to generate an interactive AR analysis.
      </Text>

      <View style={styles.card}>
        <TouchableOpacity style={styles.uploadBox} onPress={handleFileUpload} disabled={isStarting}>
          <Text style={styles.uploadIcon}>📂</Text>
          <Text style={styles.uploadText}>
            {selectedFile ? selectedFile.name : 'Tap to select file'}
          </Text>
        </TouchableOpacity>

        {selectedFile && (
          <TouchableOpacity
            style={[styles.analyzeBtn, isStarting && styles.disabledBtn]}
            onPress={handleBeginAnalysis}
            disabled={isStarting}
          >
            {isStarting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Analyze & Open</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 How it works</Text>
        <Text style={styles.infoText}>
          1. Select your file.{'\n'}
          2. We immediately open the document view.{'\n'}
          3. AI processing happens in the background.{'\n'}
          4. If analysis fails, you can retry from the view screen.
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
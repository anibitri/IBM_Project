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

  // Prefer emulator-safe host for Android; localhost for iOS (Flask on 4200)
  const API_HOST = Platform.select({
    android: 'http://10.0.2.2:4200',
    ios: 'http://localhost:4200',
    default: 'http://localhost:4200',
  });

  // Mock ON by default. To test real services:
  // 1) set DEV_MOCK = false
  // 2) remove "?mock=0" from URLs (optional if backend ignores)
  const DEV_MOCK = true;

  const requestStoragePermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const result = await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
        if (result === RESULTS.GRANTED) {
          console.log('Storage permission granted.');
          return true;
        } else {
          Alert.alert('Permission Required', 'Please allow file access to select documents.');
          return false;
        }
      } else if (Platform.OS === 'ios') {
        // iOS usually handles permission automatically with the file picker
        return true;
      }
    } catch (error) {
      console.error('Permission error:', error);
      Alert.alert('Error', 'Failed to request storage permission.');
      return false;
    }
  };

  const handleFileUpload = async() => {
    const hasPermission = await requestStoragePermission();
    if (!hasPermission) return;

    try {
      // Allow selecting PDF or Images, ensure a usable file:// URI
      const res = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.pdf, DocumentPicker.types.images],
        copyTo: 'cachesDirectory',
      });
      setSelectedFile(res);
      console.log('Selected file:', {
        name: res?.name,
        type: res?.type,
        uri: res?.uri,
        fileCopyUri: res?.fileCopyUri,
      });
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        console.error('User cancelled file picker', err);
        Alert.alert('Cancelled', 'File selection was cancelled.');
      } else {
        throw err;
      }
    }
  };

  const handleBeginAnalysis = async () => {
    if (!selectedFile) {
      Alert.alert('No File Selected', 'Please select a file to upload.');
      return;
    }

    setAnalyzing(true);

    try {
      const formData = new FormData();

      let fileUri = selectedFile?.fileCopyUri || selectedFile?.uri;
      if (!fileUri) {
        throw new Error('No usable file URI. Please re-select the file.');
      }
      if (Platform.OS === 'ios' && !fileUri.startsWith('file://')) {
        if (fileUri.startsWith('file:/')) fileUri = fileUri.replace(/^file:\//, 'file://');
        else fileUri = `file://${fileUri.replace(/^\/+/, '')}`;
      }

      const nameFromPicker = selectedFile?.name || '';
      const ext = (nameFromPicker.split('.').pop() || '').toLowerCase();
      const mimeFromPicker = selectedFile?.type || '';
      const extToMime = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp',
      };
      const mime = mimeFromPicker || extToMime[ext] || 'application/octet-stream';
      const fileName =
        nameFromPicker && nameFromPicker.includes('.')
          ? nameFromPicker
          : mime === 'application/pdf'
          ? 'document.pdf'
          : 'image.jpg';

      formData.append('file', {
        uri: fileUri,
        type: mime,
        name: fileName,
      });

      // 1) Upload file (send mock flag)
      const uploadUrl = `${API_HOST}/api/upload/?mock=${DEV_MOCK ? '1' : '0'}`;
      const uploadResp = await axios.post(uploadUrl, formData, { timeout: 30000 });
      const uploadData = uploadResp?.data || {};
      if (uploadResp.status < 200 || uploadResp.status >= 300 || uploadData.status !== 'ok') {
        throw new Error(uploadData?.error || `Upload failed with status ${uploadResp.status}`);
      }

      const storedName = uploadData?.file?.stored_name;
      if (!storedName) throw new Error('No stored_name returned from server.');

      // Prefer preprocess result from upload
      let finalAnalysis = null;
      let finalAr = [];
      const pre = uploadData?.preprocess;

      if (pre && pre.status === 'ok') {
        // Use AI/AR from preprocess
        // For images: pre.ai and pre.ar
        // For PDFs: prefer ai_final, fallback to ai_initial; AR in pre.ar
        if (pre.kind === 'image') {
          finalAnalysis = pre.ai || pre.vision || null;
          finalAr = Array.isArray(pre?.ar?.elements) ? pre.ar.elements : [];
        } else if (pre.kind === 'pdf') {
          finalAnalysis = pre.ai_final || pre.ai_initial || null;
          finalAr = Array.isArray(pre?.ar?.elements) ? pre.ar.elements : [];
        }
      }

      // 2) Fallback to explicit analyze call if preprocess missing or errored
      if (!finalAnalysis) {
        const analyzeUrl = `${API_HOST}/api/vision/analyze`;
        const analyzeResp = await axios.post(analyzeUrl, {
          stored_name: storedName,
          mock: DEV_MOCK, // set to false when testing real services
        }, { timeout: 30000 });
        const analyzeData = analyzeResp?.data || {};
        if (analyzeResp.status < 200 || analyzeResp.status >= 300 || analyzeData.status !== 'ok') {
          throw new Error(analyzeData?.analysis?.error || 'Analysis failed');
        }
        finalAnalysis = analyzeData?.analysis || analyzeData?.ai || null;
        finalAr = Array.isArray(analyzeData?.ar?.elements) ? analyzeData.ar.elements : [];
      }

      const analysisAnswer =
        (typeof finalAnalysis?.answer === 'string' && finalAnalysis.answer) ||
        (typeof finalAnalysis?.analysis === 'string' && finalAnalysis.analysis) ||
        '';

      const id = `${Date.now()}`;
      addHistoryItem({
        id,
        name: selectedFile.name,
        uri: selectedFile.fileCopyUri || selectedFile.uri,
        type: selectedFile.type || mime,
        status: 'processed',
        analysisSummary: analysisAnswer.slice(0, 300),
        arElementsCount: finalAr.length,
      });

      Alert.alert('Success', DEV_MOCK ? 'Mock analysis complete.' : 'Analysis complete.');
      navigation.navigate('Home');
    } catch (error) {
      console.error('Begin Analysis Failed', {
        message: error?.message,
        status: error?.response?.status,
        data: error?.response?.data,
      });
      Alert.alert('Upload/Analysis Failed', error?.message || 'Failed to start analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Upload Technical Document</Text>
      <Text style={styles.subtitle}>This feature lets you upload PDF or image files for AR-AI analysis.</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleFileUpload} disabled={analyzing}>
          <Text style={styles.buttonText}>Select File to Upload (PDF/Image)</Text>
        </TouchableOpacity>

        {selectedFile && (
          <View style={styles.fileInfo}>
            <Text style={styles.infoText}>Selected File: {selectedFile.name}</Text>
            <TouchableOpacity
              style={[styles.button, styles.analyzeBtn]}
              onPress={handleBeginAnalysis}
              disabled={analyzing}
            >
              {analyzing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Begin Analysis</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Info</Text>
        <Text style={styles.infoText}>
          Upload functionality is under development. Analysis will be connected to the backend in a later update.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', padding: 20, backgroundColor: '#f8f9fa' },
  title: { fontSize: 24, fontWeight: 'bold', marginTop: 50, color: '#1c1c1e' },
  subtitle: { fontSize: 15, color: '#6c757d', textAlign: 'center', marginVertical: 10, paddingHorizontal: 20 },
  buttonContainer: { marginVertical: 40, width: '100%' },
  button: { backgroundColor: '#007bff', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 8, alignSelf: 'center' },
  analyzeBtn: { backgroundColor: '#28a745', marginTop: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  infoSection: { width: '100%', marginTop: 30, paddingHorizontal: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '600', marginBottom: 10, color: '#1c1c1e' },
  infoText: { fontSize: 15, color: '#6c757d', lineHeight: 22 },
  fileInfo: { marginTop: 15, padding: 10, backgroundColor: '#e9ecef', borderRadius: 5, width: '100%' },
});
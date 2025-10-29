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
      const res = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.pdf],
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

      // Prefer fileCopyUri (file://) over potentially unsupported ph:// URIs
      let fileUri = selectedFile?.fileCopyUri || selectedFile?.uri;
      if (!fileUri) {
        throw new Error('No usable file URI. Please re-select the file.');
      }
      // Ensure proper file:// scheme on iOS
      if (Platform.OS === 'ios' && !fileUri.startsWith('file://')) {
        if (fileUri.startsWith('file:/')) {
          fileUri = fileUri.replace(/^file:\//, 'file://');
        } else {
          fileUri = `file://${fileUri.replace(/^\/+/, '')}`;
        }
      }

      // Provide a safe filename fallback with .pdf
      const fileName =
        (selectedFile?.name && selectedFile.name.includes('.'))
          ? selectedFile.name
          : 'document.pdf';

      formData.append('file', {
        uri: fileUri,
        type: selectedFile?.type || 'application/pdf',
        name: fileName,
      });

      console.log('Uploading with URI:', fileUri);

      // 1) Upload file
      const uploadUrl = `${API_HOST}/api/upload/`;
      const uploadResp = await axios.post(uploadUrl, formData, {
        // Let axios set the multipart boundary header
        timeout: 30000,
      });

      console.log('Upload response:', uploadResp?.status, uploadResp?.data);

      const uploadData = uploadResp?.data || {};
      if (uploadResp.status < 200 || uploadResp.status >= 300 || uploadData.status !== 'ok') {
        throw new Error(uploadData?.error || `Upload failed with status ${uploadResp.status}`);
      }

      const storedName = uploadData?.file?.stored_name;
      if (!storedName) {
        throw new Error('No stored_name returned from server.');
      }

      // 2) Analyze via Granite Vision using stored_name
      const analyzeUrl = `${API_HOST}/api/vision/analyze`;
      const analyzeResp = await axios.post(analyzeUrl, {
        stored_name: storedName,
        mock: true, // keep true during development
      }, { timeout: 30000 });

      console.log('Analyze response:', analyzeResp?.status, analyzeResp?.data);

      const analyzeData = analyzeResp?.data || {};
      if (analyzeResp.status < 200 || analyzeResp.status >= 300 || analyzeData.status !== 'ok') {
        throw new Error(analyzeData?.analysis?.error || 'Analysis failed');
      }

      // Optional: capture summary for history
      const analysisAnswer = analyzeData?.analysis?.answer || '';
      const arElements = Array.isArray(analyzeData?.ar?.elements) ? analyzeData.ar.elements : [];
      const id = `${Date.now()}`;
      addHistoryItem({
        id,
        name: selectedFile.name,
        uri: selectedFile.fileCopyUri || selectedFile.uri,
        type: selectedFile.type || 'application/pdf',
        status: 'processed',
        analysisSummary: analysisAnswer.slice(0, 300),
        arElementsCount: arElements.length,
      });

      Alert.alert('Success', 'Analysis complete. AR data prepared.');
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
      <Text style={styles.subtitle}>This feature lets you upload documents for AR-AI analysis.</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleFileUpload} disabled={analyzing}>
          <Text style={styles.buttonText}>Select File to Upload (PDF)</Text>
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
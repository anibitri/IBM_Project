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
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.pdf],
      });
      setSelectedFile(res[0]);

      console.log('Selected file:', res[0]);

    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        // User cancelled the picker
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
      formData.append('file', {
        uri: selectedFile.fileCopyUri || selectedFile.uri, // fixed key name
        type: selectedFile.type || 'application/pdf',
        name: selectedFile.name || 'document.pdf',
      });

      // Place your API endpoint here
      // const response = await axios.post('https://your-api-endpoint.com/upload', formData, {
      //   headers: {
      //     'Content-Type': 'multipart/form-data',
      //   },
      // });

      await new Promise(resolve => setTimeout(resolve, 1200)); // Simulate network delay

      const id = `${Date.now()}`;
      addHistoryItem({
        id,
        name: selectedFile.name,
        uri: selectedFile.fileCopyUri || selectedFile.uri, // fixed key name
        type: selectedFile.type || 'application/pdf',
        // createdAt removed earlier; keep if you need it elsewhere
        status: 'processed',
      });

      Alert.alert('Success', 'File uploaded successfully!');
      navigation.navigate('Home');
      
    } catch (error) {
      console.error('Begin Analysis Failed', error);
      Alert.alert('Upload Failed', 'Failed to start analysis.');
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
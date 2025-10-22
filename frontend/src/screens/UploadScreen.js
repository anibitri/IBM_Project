import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

export default function UploadScreen({ navigation }) {
  // Placeholder handler for Upload button
  const handleUploadPlaceholder = () => {
    Alert.alert('Coming Soon', 'Upload functionality will be added later.');
  };

  const [selectedFile, setSelectedFile] = React.useState(null);

  // const requestStoragePermission = async () => {
  //   try {
  //     if (Platform.OS === 'android') {
  //       const result = await request(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
  //       if (result === RESULTS.GRANTED) {
  //         console.log('Storage permission granted.');
  //         return true;
  //       } else {
  //         Alert.alert('Permission Required', 'Please allow file access to select documents.');
  //         return false;
  //       }
  //     } else if (Platform.OS === 'ios') {
  //       // iOS usually handles permission automatically with the file picker
  //       return true;
  //     }
  //   } catch (error) {
  //     console.error('Permission error:', error);
  //     Alert.alert('Error', 'Failed to request storage permission.');
  //     return false;
  //   }
  // };

  const handleFileUpload = async() => {
    // const hasPermission = await requestStoragePermission();
    // if (!hasPermission) return;

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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Upload Technical Document</Text>
      <Text style={styles.subtitle}>This feature will allow you to upload documents for AR-AI analysis.</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleFileUpload}>
          <Text style={styles.buttonText}>Select File to Upload (Must be PDF)</Text>
        </TouchableOpacity>
        {selectedFile && (
          <View style={styles.fileInfo}>
            <Text style={styles.infoText}>Selected File: {selectedFile.name}</Text>
          </View>
        )}
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Info</Text>
        <Text style={styles.infoText}>Upload functionality is under development and will be available in future updates.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 50,
    color: '#1c1c1e',
  },
  subtitle: {
    fontSize: 15,
    color: '#6c757d',
    textAlign: 'center',
    marginVertical: 10,
    paddingHorizontal: 20,
  },
  buttonContainer: {
    marginVertical: 40,
  },
  button: {
    backgroundColor: '#007bff',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoSection: {
    width: '100%',
    marginTop: 30,
    paddingHorizontal: 10,
  },
  sectionTitle: {
    fontSize:   20,
    fontWeight: '600',
    marginBottom: 10,
    color: '#1c1c1e',
  },
  infoText: {
    fontSize: 15,
    color: '#6c757d',
    lineHeight: 22,
  },
  fileInfo: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#e9ecef',
    borderRadius: 5,
  },
  infoText: {
    fontSize: 15,
    color: '#6c757d',
    lineHeight: 22,
  },
});
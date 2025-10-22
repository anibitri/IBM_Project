import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';

export default function UploadScreen({ navigation }) {
  // Placeholder handler for Upload button
  const handleUploadPlaceholder = () => {
    Alert.alert('Coming Soon', 'Upload functionality will be added later.');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Upload Technical Document</Text>
      <Text style={styles.subtitle}>This feature will allow you to upload documents for AR-AI analysis.</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleUploadPlaceholder}>
          <Text style={styles.buttonText}>Select File to Upload</Text>
        </TouchableOpacity>
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
});
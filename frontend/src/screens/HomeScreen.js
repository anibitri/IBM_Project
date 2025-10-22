// frontend/HomeScreen.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useHistory } from '../context/HistoryContext';

export default function HomeScreen({ navigation }) {

  const { history } = useHistory();

  // Normalize history to a safe array
  const safeListData = Array.isArray(history) ? history.filter(Boolean) : [];

  // Placeholder handler for history item clicks
  const handleHistoryPress = (item) => {
    // TODO: Replace with navigation or other action later
    Alert.alert('History item clicked', `${item.name} (${item.id})`);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>AR-AI Technical Docs</Text>
      <Text style={styles.subtitle}>Augment and analyze technical documentation with AI</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={[styles.button, { marginRight: 20 }]} onPress={() => navigation.navigate('Upload')}>
          <Text style={styles.buttonText}>Upload</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Scan')}>
          <Text style={styles.buttonText}>Scan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.historySection}>
        <Text style={styles.sectionTitle}>Recent analyses</Text>
        {safeListData.length === 0 ? (
          <View className="emptyHistory" style={styles.emptyHistory}>
            <Text style={styles.emptyText}>No analyses yet.</Text>
          </View>
        ) : (
          <View>
            {safeListData.map((item, index) => (
              <View key={item.id ?? index}>
                <TouchableOpacity onPress={() => handleHistoryPress(item)}>
                  <Text style={{ fontWeight: '600' }}>{item.name}</Text>
                  <Text style={{ color: '#6c757d', fontSize: 12 }}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </TouchableOpacity>
                {index < safeListData.length - 1 && <View style={{ height: 12 }} />}
              </View>
            ))}
          </View>
        )}
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
    fontSize: 28,
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
    flexDirection: 'row',
    marginVertical: 40,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    paddingHorizontal: 35,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  historySection: {
    width: '100%',
    marginTop: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 10,
    color: '#1c1c1e',
  },
  emptyHistory: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    borderColor: '#e9ecef',
    borderWidth: 1,
  },
  emptyText: {
    color: '#adb5bd',
    fontStyle: 'italic',
  },
});

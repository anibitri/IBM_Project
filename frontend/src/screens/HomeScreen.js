import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useHistory } from '../context/HistoryContext';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen({ navigation }) {
  const { history } = useHistory();

  // Sort history by date (newest first)
  const safeListData = Array.isArray(history) 
    ? history.filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) 
    : [];

  // --- SMART NAVIGATION HANDLER ---
  const handleHistoryPress = (item) => {
  // REQUEST FIX: Check if the item has a document attached (uri or storedName)
  // If it does, prioritize the Document View.
  // Otherwise, go to the Chat View.
  
    if (item.uri || item.imageUrl || item.storedName) {
      // Has a document -> Open DocView
      navigation.navigate('DocView', { itemId: item.id });
    } else {
      // Text-only chat -> Open Chat
      navigation.navigate('Chat', { chatId: item.id });
    }
  };

  const getStatusIcon = (status) => {
    if (status === 'analyzing') return <Ionicons name="hourglass-outline" size={20} color="#FF9500" />;
    if (status === 'failed') return <Ionicons name="alert-circle-outline" size={20} color="#FF3B30" />;
    return <Ionicons name="checkmark-circle-outline" size={20} color="#34C759" />;
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>AR-AI Technical Docs</Text>
      <Text style={styles.subtitle}>Augment and analyze technical documentation with AI</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={[styles.button, styles.uploadBtn]} onPress={() => navigation.navigate('Upload')}>
          <Ionicons name="cloud-upload-outline" size={24} color="#fff" />
          <Text style={styles.buttonText}>Upload New</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.scanBtn]} onPress={() => navigation.navigate('Scan')}>
          <Ionicons name="camera-outline" size={24} color="#fff" />
          <Text style={styles.buttonText}>Live Scan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.historySection}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        
        {safeListData.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Ionicons name="documents-outline" size={40} color="#adb5bd" style={{marginBottom: 10}} />
            <Text style={styles.emptyText}>No recent documents or chats.</Text>
            <Text style={styles.emptySubText}>Upload a file to get started.</Text>
          </View>
        ) : (
          <View>
            {safeListData.map((item) => (
              <TouchableOpacity 
                key={item.id} 
                style={styles.historyItem} 
                onPress={() => handleHistoryPress(item)}
              >
                {/* Icon Box */}
                <View style={[styles.iconBox, { backgroundColor: item.type === 'chat' ? '#E3F2FD' : '#E8F5E9' }]}>
                    <Ionicons 
                        name={item.type === 'chat' ? 'chatbubbles-outline' : 'document-text-outline'} 
                        size={24} 
                        color={item.type === 'chat' ? '#1976D2' : '#2E7D32'} 
                    />
                </View>

                {/* Text Content */}
                <View style={styles.itemContent}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemDate}>
                        {new Date(item.createdAt).toLocaleDateString()} • {new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </Text>
                </View>

                {/* Status Indicator (Only for docs) */}
                <View style={styles.statusCol}>
                    {item.type !== 'chat' && getStatusIcon(item.status)}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#f8f9fa' },
  title: { fontSize: 26, fontWeight: '800', marginTop: 40, color: '#1c1c1e', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#6c757d', textAlign: 'center', marginTop: 8, marginBottom: 30 },
  
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40, width: '100%' },
  button: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  uploadBtn: { backgroundColor: '#007AFF', marginRight: 10 },
  scanBtn: { backgroundColor: '#5856D6', marginLeft: 10 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8 },

  historySection: { width: '100%' },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 15, color: '#1c1c1e' },
  
  historyItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  iconBox: { width: 45, height: 45, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  itemContent: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 },
  itemDate: { fontSize: 12, color: '#999' },
  statusCol: { marginLeft: 10, justifyContent: 'center' },

  emptyHistory: { backgroundColor: '#fff', borderRadius: 12, padding: 40, alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#e9ecef' },
  emptyText: { color: '#6c757d', fontSize: 16, fontWeight: '600' },
  emptySubText: { color: '#adb5bd', fontSize: 14, marginTop: 5 },
});
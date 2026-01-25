import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useHistory } from '../context/HistoryContext';
import { Ionicons } from '@expo/vector-icons'; 
import axios from 'axios';

export default function DocumentScreen({ route, navigation }) {
  const { itemId } = route.params;
  const { history, updateHistoryItem, deleteHistoryItem } = useHistory();

  // Find live object from context
  const item = history.find(i => i.id === itemId);
  
  // API Config
  const API_HOST = Platform.select({
    android: 'http://10.0.2.2:4200',
    ios: 'http://localhost:4200',
    default: 'http://localhost:4200',
  });
  const DEV_MOCK = false;

  useEffect(() => {
    if (!item) navigation.goBack();
  }, [item, navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleDelete} style={{ marginRight: 15 }}>
          <Ionicons name="trash-outline" size={24} color="#FF3B30" />
        </TouchableOpacity>
      ),
      title: item ? (item.name || 'Document') : 'Loading...',
    });
  }, [navigation, item]);

  const handleDelete = () => {
    Alert.alert("Delete Document", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { deleteHistoryItem(itemId); navigation.goBack(); } }
    ]);
  };

  // --- TRIGGER ANALYSIS LOGIC ---
  const runAnalysis = async () => {
    if (!item) return;
    
    // 1. Update status to analyzing
    updateHistoryItem(itemId, { status: 'analyzing', error: null });

    try {
      const formData = new FormData();
      const mimeType = item.type || 'application/octet-stream';
      
      formData.append('file', {
        uri: item.uri,
        type: mimeType,
        name: item.name || 'upload.bin',
      });

      const uploadUrl = `${API_HOST}/api/upload/?mock=${DEV_MOCK ? '1' : '0'}`;
      
      console.log("Starting analysis...");
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
      
      if (preprocess.kind === 'image') {
        aiSummary = preprocess.ai?.answer || preprocess.vision?.answer || "";
        arElements = preprocess.ar?.elements || [];
      } else {
        aiSummary = preprocess.ai_final?.answer || preprocess.ai_initial?.answer || "";
        arElements = preprocess.ar?.elements || [];
      }

      // 2. Update status to completed
      updateHistoryItem(itemId, {
        status: 'completed',
        analysisSummary: aiSummary,
        storedName: storedName,
        imageUrl: imageUrl, // Server URL
        arElements: arElements,
      });

    } catch (error) {
      console.error("Analysis Error:", error);
      updateHistoryItem(itemId, {
        status: 'failed',
        error: error.response?.data?.error || error.message || 'Connection failed'
      });
    }
  };

  if (!item) return null;

  const displayImage = item.uri || item.imageUrl;
  const hasARData = item.status === 'completed' && item.arElements && item.arElements.length > 0;

  // --- VIEW: ANALYZING ---
  if (item.status === 'analyzing') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Analyzing Document...</Text>
        <Text style={styles.subText}>Process runs in background.</Text>
      </View>
    );
  }

  // --- VIEW: FAILED ---
  if (item.status === 'failed') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
         <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={40} color="#FF3B30" />
            <Text style={styles.errorTitle}>Analysis Failed</Text>
            <Text style={styles.errorText}>{item.error}</Text>
         </View>
         
         {/* Show Image even if failed */}
         <View style={styles.imageContainer}>
            <Image source={{ uri: displayImage }} style={styles.thumbnail} resizeMode="contain" />
         </View>

         <TouchableOpacity style={styles.retryBtn} onPress={runAnalysis}>
            <Text style={styles.retryText}>Retry Analysis</Text>
         </TouchableOpacity>
      </ScrollView>
    );
  }

  // --- VIEW: MAIN (Idle OR Completed) ---
  return (
    <ScrollView contentContainerStyle={styles.container}>
      
      {/* 1. DOCUMENT PREVIEW */}
      <View style={styles.imageContainer}>
        {displayImage ? (
            <Image 
                source={{ uri: displayImage }} 
                style={styles.thumbnail} 
                resizeMode="contain" 
            />
        ) : (
            <View style={styles.placeholder}>
                <Ionicons name="document-text-outline" size={60} color="#ccc" />
                <Text style={{color: '#999', marginTop: 10}}>No Preview</Text>
            </View>
        )}
        
        {hasARData && (
            <View style={styles.badge}>
                <Text style={styles.badgeText}>Ready for AR</Text>
            </View>
        )}
      </View>

      {/* 2. ACTIONS */}
      
      {/* CASE A: Not Analyzed Yet (Idle) */}
      {(!item.status || item.status === 'idle') && (
        <View style={styles.actionSection}>
            <Text style={styles.infoText}>This document has not been analyzed yet.</Text>
            <TouchableOpacity style={styles.analyzeBtn} onPress={runAnalysis}>
                <Ionicons name="scan-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.analyzeBtnText}>Analyze Document</Text>
            </TouchableOpacity>
        </View>
      )}

      {/* CASE B: Analysis Complete */}
      {item.status === 'completed' && (
        <>
            {hasARData ? (
                <TouchableOpacity style={styles.arButton} onPress={() => Alert.alert("AR", "Launching AR...")}>
                    <Ionicons name="cube-outline" size={24} color="#fff" style={{ marginRight: 10 }} />
                    <Text style={styles.arButtonText}>Launch AR Visualization</Text>
                </TouchableOpacity>
            ) : (
                <View style={[styles.card, {marginBottom: 20}]}>
                    <Text style={{color: '#666', fontStyle:'italic'}}>Analysis complete, but no AR components were detected.</Text>
                </View>
            )}

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>AI Summary</Text>
                <View style={styles.card}>
                    <Text style={styles.summaryText}>
                        {item.analysisSummary || "No summary available."}
                    </Text>
                </View>
            </View>
        </>
      )}

      {/* 3. METADATA */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>File Details</Text>
        <View style={styles.card}>
            <Text style={{marginBottom: 5, color:'#333'}}>Name: {item.name}</Text>
            <Text style={{marginBottom: 5, color:'#333'}}>Type: {item.type || 'Unknown'}</Text>
            <Text style={{marginBottom: 5, color:'#333'}}>Date: {new Date(item.createdAt).toLocaleDateString()}</Text>
            <Text style={{color:'#333'}}>Status: {item.status || 'Not Analyzed'}</Text>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#F2F4F8' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  
  loadingText: { marginTop: 20, fontSize: 18, fontWeight: '600' },
  subText: { marginTop: 10, color: '#666' },
  infoText: { textAlign: 'center', color: '#666', marginBottom: 15 },
  
  errorBox: { alignItems: 'center', marginBottom: 20, padding: 15, backgroundColor: '#ffebeb', borderRadius: 12 },
  errorTitle: { fontSize: 18, fontWeight: 'bold', color: '#FF3B30', marginTop: 5 },
  errorText: { textAlign: 'center', color: '#333', marginTop: 5 },

  imageContainer: { height: 300, backgroundColor: '#E1E4E8', borderRadius: 12, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#ddd' },
  thumbnail: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  
  badge: { position: 'absolute', top: 10, right: 10, backgroundColor: '#34C759', padding: 6, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  actionSection: { marginBottom: 30 },
  analyzeBtn: { flexDirection: 'row', backgroundColor: '#5856D6', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#5856D6', shadowOpacity: 0.3, shadowOffset: {width:0, height:4} },
  analyzeBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  retryBtn: { padding: 16, backgroundColor: '#FF3B30', borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  retryText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  arButton: { flexDirection: 'row', backgroundColor: '#007AFF', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 30 },
  arButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10, color: '#1A1A1A' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  summaryText: { fontSize: 15, lineHeight: 22, color: '#333' },
});
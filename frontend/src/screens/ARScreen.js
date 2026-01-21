import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  Image, 
  StyleSheet, 
  Dimensions, 
  ScrollView, 
  TouchableOpacity, 
  Modal, 
  SafeAreaView,
  Alert 
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ARDisplayScreen({ route, navigation }) {
  // 1. Get Data from Navigation
  // We accept 'data' (from upload) or standard params
  const { data } = route.params || {};
  
  // Extract key fields
  // Support both single image (current) and future multi-page arrays
  const rawSegments = data?.segments || data?.ar || []; 
  const imageUrl = data?.file?.url 
    ? `http://192.168.1.15:5000${data.file.url}` // Replace with your IP or use Config
    : null;
    
  // --- STATE ---
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [renderedSize, setRenderedSize] = useState({ width: 0, height: 0 });
  const [selectedBox, setSelectedBox] = useState(null);
  
  // Basic Multi-View State (Prepared for future PDF pages)
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 1; // Hardcoded for now, but ready for dynamic length

  // --- 2. IMAGE SCALING LOGIC ---
  useEffect(() => {
    if (imageUrl) {
      Image.getSize(imageUrl, (width, height) => {
        // 1. Save original "Natural" size (e.g., 1920x1080)
        setNaturalSize({ width, height });
        
        // 2. Calculate "Rendered" size (fit to screen width)
        const scaleFactor = SCREEN_WIDTH / width;
        const displayHeight = height * scaleFactor;
        setRenderedSize({ width: SCREEN_WIDTH, height: displayHeight });
        
      }, (error) => console.error("Could not get image size:", error));
    }
  }, [imageUrl]);

  // --- 3. RENDER AR BOXES ---
  const renderOverlays = () => {
    if (!naturalSize.width || !renderedSize.width) return null;
    
    // Calculate scale ratio (Rendered / Original)
    const scale = renderedSize.width / naturalSize.width;

    return rawSegments.map((box, index) => {
      // Backend (MobileSAM) returns [x1, y1, x2, y2] in absolute pixels
      // We must guard against malformed data
      if (!Array.isArray(box) || box.length < 4) return null;

      const [x1, y1, x2, y2] = box;

      const boxStyle = {
        position: 'absolute',
        left: x1 * scale,
        top: y1 * scale,
        width: (x2 - x1) * scale,
        height: (y2 - y1) * scale,
        borderWidth: 2,
        borderColor: '#00C853', // Technical Green
        backgroundColor: 'rgba(0, 200, 83, 0.15)',
        borderRadius: 4,
        zIndex: 10,
      };

      return (
        <TouchableOpacity
          key={`seg-${index}`}
          style={boxStyle}
          activeOpacity={0.7}
          onPress={() => setSelectedBox({ index, coords: box })}
        />
      );
    });
  };

  const handleAskAI = () => {
    // Navigate to Chat, passing context about this component
    setSelectedBox(null);
    navigation.navigate('Chat', { 
      // Context injection placeholder
      initialQuery: `Tell me about the component at coordinates ${selectedBox.coords}` 
    });
  };

  // --- RENDER ---
  return (
    <SafeAreaView style={styles.container}>
      
      {/* 1. Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Schematic View</Text>
        <Text style={styles.headerSubtitle}>
          {rawSegments.length} Interactive Elements Detected
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* 2. Main AR Viewer */}
        <View style={styles.viewerCard}>
          {imageUrl && naturalSize.width > 0 ? (
            <View style={{ width: renderedSize.width, height: renderedSize.height }}>
              {/* The Schematic Image */}
              <Image
                source={{ uri: imageUrl }}
                style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
              />
              {/* The AR Overlay Layer */}
              {renderOverlays()}
            </View>
          ) : (
            <View style={styles.loadingBox}>
              <Text>Loading Diagram...</Text>
            </View>
          )}
        </View>

        {/* 3. Info / Summary Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Vision Analysis</Text>
          <Text style={styles.infoText}>
            {data?.vision_analysis?.summary || data?.analysis?.summary || "No textual analysis provided."}
          </Text>
        </View>

      </ScrollView>

      {/* 4. Basic Multi-Diagram Navigation (Footer) */}
      <View style={styles.footerNav}>
        <TouchableOpacity disabled={true} style={styles.navBtnDisabled}>
          <Text style={styles.navText}>Previous</Text>
        </TouchableOpacity>
        
        <Text style={styles.pageText}>Diagram {currentPage} of {totalPages}</Text>
        
        <TouchableOpacity disabled={true} style={styles.navBtnDisabled}>
          <Text style={styles.navText}>Next</Text>
        </TouchableOpacity>
      </View>

      {/* 5. Component Detail Modal */}
      <Modal
        visible={!!selectedBox}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBox(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Component #{selectedBox?.index + 1}</Text>
            <Text style={styles.modalSub}>Detected Object</Text>
            
            <View style={styles.divider} />
            
            <Text style={styles.modalDesc}>
              Location: [{selectedBox?.coords.map(n=>Math.round(n)).join(', ')}]
            </Text>
            
            <TouchableOpacity style={styles.actionBtn} onPress={handleAskAI}>
              <Text style={styles.actionBtnText}>✨ Ask AI about this</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedBox(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Neutral Technical Theme
  container: { flex: 1, backgroundColor: '#F5F7F9' }, 

  header: {
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#333' },
  headerSubtitle: { fontSize: 13, color: '#00C853', fontWeight: '600', marginTop: 4 },

  scrollContent: { paddingBottom: 80 },

  viewerCard: {
    backgroundColor: '#FFF',
    marginTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
    overflow: 'hidden', // Ensures boxes don't bleed out
  },
  
  loadingBox: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#Eef',
  },

  infoCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  infoTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#333' },
  infoText: { fontSize: 14, color: '#555', lineHeight: 22 },

  // Footer Nav
  footerNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  navBtnDisabled: { opacity: 0.3 },
  navText: { fontSize: 16, fontWeight: '600', color: '#007AFF' },
  pageText: { fontSize: 14, fontWeight: '500', color: '#888' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#FFF', borderRadius: 16, padding: 24, alignItems: 'center', elevation: 10 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  modalSub: { fontSize: 14, color: '#888', marginBottom: 16 },
  divider: { height: 1, width: '100%', backgroundColor: '#EEE', marginBottom: 16 },
  modalDesc: { fontSize: 14, color: '#666', marginBottom: 24, fontFamily: 'monospace', backgroundColor: '#F5F5F5', padding: 8, borderRadius: 4 },
  
  actionBtn: { 
    backgroundColor: '#007AFF', 
    width: '100%', 
    paddingVertical: 12, 
    borderRadius: 8, 
    alignItems: 'center', 
    marginBottom: 12 
  },
  actionBtnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  
  closeBtn: { padding: 10 },
  closeBtnText: { color: '#888', fontWeight: '600' },
});
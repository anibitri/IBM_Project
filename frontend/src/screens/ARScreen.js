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
  Alert 
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ARDisplayScreen({ route, navigation }) {
  // 1. Get Data passed from UploadScreen
  const { data } = route.params || {};
  const { imageUrl, arElements, fileMeta } = data || {};

  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [selectedPart, setSelectedPart] = useState(null);

  // 2. Calculate Image Aspect Ratio for Display
  useEffect(() => {
    if (fileMeta && fileMeta.width && fileMeta.height) {
      // Use backend metadata if available (most accurate)
      const ratio = fileMeta.width / fileMeta.height;
      const displayHeight = SCREEN_WIDTH / ratio;
      setImageSize({ width: SCREEN_WIDTH, height: displayHeight });
    } else if (imageUrl) {
      // Fallback: Fetch image dimensions remotely
      Image.getSize(imageUrl, (w, h) => {
        const ratio = w / h;
        const displayHeight = SCREEN_WIDTH / ratio;
        setImageSize({ width: SCREEN_WIDTH, height: displayHeight });
      }, (err) => console.error("Failed to get image size", err));
    }
  }, [imageUrl, fileMeta]);

  // 3. Render the Interactive Boxes
  const renderInteractiveZones = () => {
    if (!arElements || !imageSize.width) return null;

    return arElements.map((el, index) => {
      // Backend format: bbox = [ymin, xmin, ymax, xmax] (Normalized 0.0 - 1.0)
      const bbox = el.bbox || [];
      if (bbox.length < 4) return null;

      const [ymin, xmin, ymax, xmax] = bbox;

      // Convert Normalized % to Absolute Pixels (or strict %)
      const style = {
        top: `${ymin * 100}%`,
        left: `${xmin * 100}%`,
        height: `${(ymax - ymin) * 100}%`,
        width: `${(xmax - xmin) * 100}%`,
        position: 'absolute',
        borderWidth: 2,
        borderColor: '#00FF00', // Classic AR Green
        backgroundColor: 'rgba(0, 255, 0, 0.2)', // Semi-transparent fill
        borderRadius: 4,
        zIndex: 10,
      };

      return (
        <TouchableOpacity
          key={el.id || index}
          style={style}
          activeOpacity={0.6}
          onPress={() => setSelectedPart(el)}
        />
      );
    });
  };

  if (!data) {
    return (
      <View style={styles.center}>
        <Text>No analysis data found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Interactive Analysis</Text>
          <Text style={styles.subtitle}>Tap green zones for details</Text>
        </View>

        {/* The "AR" Board */}
        <View style={[styles.imageContainer, { width: imageSize.width, height: imageSize.height }]}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
            />
          ) : (
            <View style={styles.placeholder}><Text>Image Loading Error</Text></View>
          )}

          {/* This overlays the buttons on top of the image */}
          {renderInteractiveZones()}
        </View>

        {/* Text Summary Section */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>AI Summary</Text>
          <Text style={styles.summaryText}>
            {data.analysisSummary || "No summary available."}
          </Text>
        </View>
      </ScrollView>

      {/* Pop-up Modal for Details */}
      {selectedPart && (
        <Modal
          transparent={true}
          animationType="fade"
          visible={!!selectedPart}
          onRequestClose={() => setSelectedPart(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{selectedPart.label || "Unknown Component"}</Text>
              
              <View style={styles.divider} />
              
              <Text style={styles.modalDesc}>
                {selectedPart.description || "No description provided by AI."}
              </Text>

              <TouchableOpacity 
                style={styles.closeBtn} 
                onPress={() => setSelectedPart(null)}
              >
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' }, // Dark mode background for AR feel
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { alignItems: 'center', paddingBottom: 40 },
  
  header: { width: '100%', padding: 20, backgroundColor: '#1E1E1E', marginBottom: 10 },
  title: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  subtitle: { color: '#AAA', fontSize: 14, marginTop: 4 },

  imageContainer: { position: 'relative', backgroundColor: '#000' }, // Relative is key for absolute children
  
  summaryBox: { width: '90%', marginTop: 20, padding: 15, backgroundColor: '#1E1E1E', borderRadius: 8 },
  summaryTitle: { color: '#4CAF50', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  summaryText: { color: '#DDD', lineHeight: 22 },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#222', borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#444' },
  modalTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  divider: { width: '100%', height: 1, backgroundColor: '#444', marginVertical: 15 },
  modalDesc: { color: '#CCC', fontSize: 16, textAlign: 'center', marginBottom: 20, lineHeight: 24 },
  closeBtn: { backgroundColor: '#4CAF50', paddingVertical: 10, paddingHorizontal: 30, borderRadius: 20 },
  closeText: { color: '#FFF', fontWeight: 'bold' }
});
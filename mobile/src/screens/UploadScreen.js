import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DocumentPicker from 'react-native-document-picker';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { useMobileDocumentContext as useDocumentContext } from '../context/MobileDocumentContext';
import { spacing, getPalette } from '../styles/theme';

export default function UploadScreen({ navigation, route }) {
  const { uploadAndProcess, attachDocumentToSession, loading, error, clearError, clearDocument, accessibilitySettings } = useDocumentContext();
  const showAnalysisError = (msg) => {
    clearError();
    setPreview(null);
    Alert.alert('Analysis Failed', msg || 'Failed to process document');
  };
  const attachMode = route?.params?.attachMode === true;
  const processFile = attachMode ? attachDocumentToSession : uploadAndProcess;
  const postUploadNav = () => attachMode
    ? navigation.getParent()?.navigate('Chat', { screen: 'ChatMain' })
    : navigation.navigate('Diagram');
  const [preview, setPreview] = useState(null);
  const darkMode = !!accessibilitySettings?.darkMode;
  const p = getPalette(darkMode);

  const handleImagePicker = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 1 });
      if (result.didCancel) return;
      if (result.errorCode) { Alert.alert('Error', result.errorMessage || 'Failed to open gallery'); return; }
      if (!result.assets?.length) return;
      const asset = result.assets[0];
      const file = { uri: asset.uri, type: asset.type || 'image/png', name: asset.fileName || 'diagram.png' };
      setPreview(asset.uri);
      const ok = await processFile(file);
      if (ok) { postUploadNav(); } else { showAnalysisError(error); }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.images, DocumentPicker.types.pdf],
        copyTo: 'cachesDirectory',
      });
      const file = { uri: result.fileCopyUri || result.uri, type: result.type || 'application/pdf', name: result.name || 'document.pdf' };
      const ok = await processFile(file);
      if (ok) { postUploadNav(); } else { showAnalysisError(error); }
    } catch (err) {
      if (DocumentPicker.isCancel(err)) return;
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleCamera = async () => {
    try {
      const result = await launchCamera({ mediaType: 'photo', quality: 1, saveToPhotos: false });
      if (result.didCancel) return;
      if (result.errorCode) { Alert.alert('Camera Error', result.errorMessage || 'Camera permission is required'); return; }
      if (!result.assets?.length) return;
      const asset = result.assets[0];
      const file = { uri: asset.uri, type: asset.type || 'image/png', name: asset.fileName || 'diagram.png' };
      setPreview(asset.uri);
      const ok = await processFile(file);
      if (ok) { postUploadNav(); } else { showAnalysisError(error); }
    } catch (err) {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]}>
        <View style={styles.loadingWrap}>
          <View style={[styles.loadingCard, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}>
            {preview && (
              <Image source={{ uri: preview }} style={styles.loadingPreview} />
            )}
            <ActivityIndicator size="large" color={p.primary} style={{ marginTop: preview ? 20 : 0 }} />
            <Text style={[styles.loadingTitle, { color: p.text }]}>Analysing Document</Text>
            <Text style={[styles.loadingSubtitle, { color: p.subtext }]}>
              Running vision analysis → component detection → AI summary
            </Text>
            <View style={styles.steps}>
              {['Vision analysis', 'Component detection', 'AI summary'].map((step) => (
                <View key={step} style={styles.stepRow}>
                  <View style={[styles.stepDot, { backgroundColor: p.primary }]} />
                  <Text style={[styles.stepLabel, { color: p.subtext }]}>{step}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: p.border }]}
              onPress={() => { clearDocument(); setPreview(null); }}
            >
              <Text style={[styles.cancelBtnText, { color: p.subtext }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: p.primaryGlass, borderColor: p.borderTop }]}>
            <Ionicons name="cloud-upload-outline" size={34} color={p.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: p.text }]}>Upload a Diagram</Text>
          <Text style={[styles.heroSubtitle, { color: p.subtext }]}>
            Supports PNG, JPG and PDF up to 50 MB
          </Text>
        </View>

        {/* Preview thumbnail */}
        {preview && (
          <View style={styles.previewWrap}>
            <Image source={{ uri: preview }} style={[styles.preview, { borderColor: p.primary }]} />
            <TouchableOpacity style={styles.clearPreview} onPress={() => setPreview(null)}>
              <Ionicons name="close-circle" size={22} color={p.subtext} />
            </TouchableOpacity>
          </View>
        )}

        {/* Upload options */}
        <View style={styles.optionsWrap}>
          <TouchableOpacity
            style={[styles.optionBtn, { backgroundColor: p.primary }]}
            onPress={handleImagePicker}
            activeOpacity={0.82}
          >
            <Ionicons name="images-outline" size={22} color="#fff" />
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionTitle}>Choose from Gallery</Text>
              <Text style={styles.optionSub}>PNG, JPG images</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionBtn, styles.optionBtnSecondary, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}
            onPress={handleCamera}
            activeOpacity={0.8}
          >
            <Ionicons name="camera-outline" size={22} color={p.primary} />
            <View style={styles.optionTextWrap}>
              <Text style={[styles.optionTitle, { color: p.text }]}>Take a Photo</Text>
              <Text style={[styles.optionSub, { color: p.subtext }]}>Use your camera</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={p.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionBtn, styles.optionBtnSecondary, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}
            onPress={handleDocumentPicker}
            activeOpacity={0.8}
          >
            <Ionicons name="document-outline" size={22} color={p.primary} />
            <View style={styles.optionTextWrap}>
              <Text style={[styles.optionTitle, { color: p.text }]}>Browse Files</Text>
              <Text style={[styles.optionSub, { color: p.subtext }]}>PDF documents</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={p.muted} />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingBottom: 48 },

  /* Loading */
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  loadingCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  loadingPreview: { width: 100, height: 100, borderRadius: 12, marginBottom: 4 },
  loadingTitle: { fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 6, letterSpacing: -0.3 },
  loadingSubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  steps: { gap: 8, alignSelf: 'stretch', marginBottom: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDot: { width: 6, height: 6, borderRadius: 3 },
  stepLabel: { fontSize: 13 },
  cancelBtn: { borderWidth: 1, borderRadius: 100, paddingHorizontal: 24, paddingVertical: 10 },
  cancelBtnText: { fontSize: 15, fontWeight: '500' },

  /* Hero */
  hero: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: 24, paddingHorizontal: spacing.lg },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
  },
  heroTitle: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, marginBottom: 8 },
  heroSubtitle: { fontSize: 14, textAlign: 'center' },

  /* Preview */
  previewWrap: { alignItems: 'center', marginBottom: 20, position: 'relative' },
  preview: { width: 160, height: 160, borderRadius: 14, borderWidth: 2 },
  clearPreview: { position: 'absolute', top: -8, right: '28%' },

  /* Upload options */
  optionsWrap: { paddingHorizontal: spacing.lg, gap: 12 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    shadowColor: '#2997ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  optionBtnSecondary: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  optionTextWrap: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 2 },
  optionSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },

});

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
} from 'react-native';
// Replaced @expo/vector-icons
import Ionicons from 'react-native-vector-icons/Ionicons';
// Replaced expo-document-picker
import DocumentPicker from 'react-native-document-picker';
// Replaced expo-image-picker
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';

import { useMobileDocumentContext as useDocumentContext } from '../context/MobileDocumentContext';
import { colors, spacing, typography } from '../styles/theme';

export default function UploadScreen({ navigation }) {
  const { uploadAndProcess, loading, error, clearDocument, accessibilitySettings } = useDocumentContext();
  const [preview, setPreview] = useState(null);
  const darkMode = !!accessibilitySettings?.darkMode;
  const palette = darkMode
    ? {
        bg: '#121417',
        card: '#1b1f24',
        border: '#303741',
        text: '#f4f7fb',
        subtext: '#9aa3ad',
        primary: '#4ea3ff',
      }
    : {
        bg: colors.background,
        card: colors.white,
        border: colors.border,
        text: colors.text,
        subtext: colors.textLight,
        primary: colors.primary,
      };

  const handleImagePicker = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 1,
      });

      if (result.didCancel) return;
      
      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Failed to open gallery');
        return;
      }

      const asset = result.assets[0];
      const file = {
        uri: asset.uri,
        type: asset.type || 'image/png',
        name: asset.fileName || 'diagram.png',
      };
      setPreview(asset.uri);
      await uploadAndProcess(file);
      navigation.navigate('Diagram');
    } catch (err) {
      Alert.alert('Error', 'Failed to pick image');
      console.error(err);
    }
  };

  const handleDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.pickSingle({
        // Allow images and PDFs
        type: [DocumentPicker.types.images, DocumentPicker.types.pdf],
        copyTo: 'cachesDirectory', // Copies file to a safe temp folder for uploading
      });

      const file = {
        uri: result.fileCopyUri || result.uri,
        type: result.type || 'application/pdf',
        name: result.name || 'document.pdf',
      };
      await uploadAndProcess(file);
      navigation.navigate('Diagram');
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        // User cancelled the picker, do nothing
        return;
      }
      Alert.alert('Error', 'Failed to pick document');
      console.error(err);
    }
  };

  const handleCamera = async () => {
    try {
      const result = await launchCamera({
        mediaType: 'photo',
        quality: 1,
        saveToPhotos: false,
      });

      if (result.didCancel) return;

      if (result.errorCode) {
        // react-native-image-picker automatically handles requesting permissions.
        // If they denied it, it throws a 'camera_unavailable' or 'permission' error code.
        Alert.alert('Camera Error', result.errorMessage || 'Camera permission is required');
        return;
      }

      const asset = result.assets[0];
      const file = {
        uri: asset.uri,
        type: asset.type || 'image/png',
        name: asset.fileName || 'diagram.png',
      };
      setPreview(asset.uri);
      await uploadAndProcess(file);
      navigation.navigate('Diagram');
    } catch (err) {
      Alert.alert('Error', 'Failed to take photo');
      console.error(err);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <View style={[styles.header, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        <Text style={[styles.title, { color: palette.text }]}>AR Diagram Viewer</Text>
        <Text style={[styles.subtitle, { color: palette.subtext }] }>
          Upload technical diagrams for AI-powered analysis
        </Text>
      </View>

      {preview && !loading && (
        <View style={styles.previewContainer}>
          <Image source={{ uri: preview }} style={styles.preview} />
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={[styles.loadingText, { color: palette.text }]}>Processing document...</Text>
          <Text style={[styles.loadingSubtext, { color: palette.subtext }]}>
            Running Vision → AR → AI pipeline
          </Text>
          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: palette.border }]}
            onPress={() => { clearDocument(); setPreview(null); }}
          >
            <Text style={[styles.cancelButtonText, { color: palette.subtext }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, { backgroundColor: palette.primary }]}
            onPress={handleImagePicker}
          >
            <Ionicons name="images-outline" size={22} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Choose from Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonSecondary,
              {
                backgroundColor: darkMode ? '#242a31' : colors.secondary,
                borderColor: palette.primary,
              },
            ]}
            onPress={handleCamera}
          >
            <Ionicons name="camera-outline" size={22} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonSecondary,
              {
                backgroundColor: darkMode ? '#242a31' : colors.secondary,
                borderColor: palette.primary,
              },
            ]}
            onPress={handleDocumentPicker}
          >
            <Ionicons name="document-outline" size={22} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Browse Files (PDF)</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <Ionicons name="alert-circle-outline" size={16} color="#ff3b30" />
            <Text style={[styles.errorText, { marginBottom: 0, marginLeft: 6 }]}>{error}</Text>
          </View>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setPreview(null)}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.footer, { backgroundColor: palette.card, borderTopColor: palette.border }]}>
        <Text style={[styles.footerText, { color: palette.subtext }] }>
          Supports: PNG, JPG, PDF (max 50MB)
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.xl,
    backgroundColor: colors.white,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textLight,
    textAlign: 'center',
  },
  previewContainer: {
    padding: spacing.md,
    alignItems: 'center',
  },
  preview: {
    width: 200,
    height: 200,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    ...typography.h2,
    color: colors.text,
    marginTop: spacing.lg,
  },
  loadingSubtext: {
    ...typography.body,
    color: colors.textLight,
    marginTop: spacing.sm,
  },
  buttonsContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: 12,
    gap: spacing.md,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: colors.secondary,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  buttonIcon: {
    fontSize: 24,
  },
  buttonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.white,
  },
  errorContainer: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.error,
    borderRadius: 10,
    alignItems: 'center',
  },
  errorText: {
    color: colors.white,
    ...typography.body,
    marginBottom: spacing.sm,
  },
  retryButton: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.error,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  footer: {
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    ...typography.caption,
    color: colors.textLight,
  },
});
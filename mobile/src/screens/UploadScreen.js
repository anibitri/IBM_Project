import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useDocumentContext } from '@ar-viewer/shared';
import { colors, spacing, typography } from '../styles/theme';

export default function UploadScreen({ navigation }) {
  const { uploadAndProcess, loading, error } = useDocumentContext();
  const [preview, setPreview] = useState(null);

  const handleImagePicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled) {
        const file = {
          uri: result.assets[0].uri,
          type: 'image/png',
          name: 'diagram.png',
        };
        setPreview(result.assets[0].uri);
        await uploadAndProcess(file);
        navigation.navigate('Diagram');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick image');
      console.error(err);
    }
  };

  const handleDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.type === 'success') {
        const file = {
          uri: result.uri,
          type: result.mimeType || 'application/pdf',
          name: result.name,
        };
        await uploadAndProcess(file);
        navigation.navigate('Diagram');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick document');
      console.error(err);
    }
  };

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled) {
        const file = {
          uri: result.assets[0].uri,
          type: 'image/png',
          name: 'diagram.png',
        };
        setPreview(result.assets[0].uri);
        await uploadAndProcess(file);
        navigation.navigate('Diagram');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to take photo');
      console.error(err);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📐 AR Diagram Viewer</Text>
        <Text style={styles.subtitle}>
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
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Processing document...</Text>
          <Text style={styles.loadingSubtext}>
            Running Vision → AR → AI pipeline
          </Text>
        </View>
      ) : (
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleImagePicker}
          >
            <Text style={styles.buttonIcon}>🖼️</Text>
            <Text style={styles.buttonText}>Choose from Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={handleCamera}
          >
            <Text style={styles.buttonIcon}>📸</Text>
            <Text style={styles.buttonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={handleDocumentPicker}
          >
            <Text style={styles.buttonIcon}>📄</Text>
            <Text style={styles.buttonText}>Browse Files (PDF)</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setPreview(null)}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Supports: PNG, JPG, PDF (max 50MB)
        </Text>
      </View>
    </View>
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
    backgroundColor: colors.white,
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
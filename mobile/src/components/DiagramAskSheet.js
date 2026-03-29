/**
 * DiagramAskSheet
 *
 * Bottom-sheet modal for asking AI questions directly from the Diagram screen.
 * Supports three scopes:
 *   • Component — asks about the currently selected AR component
 *   • Diagram   — asks about the current page/diagram
 *   • Document  — asks across the whole uploaded document
 *
 * On submit the sheet sets the pending question in context and navigates the
 * user to the Chat tab, where it is pre-filled in the input ready to send.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMobileDocumentContext } from '../context/MobileDocumentContext';
import { getPalette } from '../styles/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Preset questions per scope ───────────────────────────────

const COMPONENT_PRESETS = [
  'What does this component do?',
  'What is it connected to?',
  'What protocols does it use?',
];

const DIAGRAM_PRESETS = [
  'Summarise this diagram',
  'What is the data flow?',
  'List all components',
];

const DOCUMENT_PRESETS = [
  'What is this document about?',
  'Summarise all diagrams',
  'What are the key components?',
];

// ─── Scope config ─────────────────────────────────────────────

const SCOPES = [
  { id: 'component', label: 'Component', icon: 'hardware-chip-outline' },
  { id: 'diagram',   label: 'Diagram',   icon: 'image-outline' },
  { id: 'document',  label: 'Document',  icon: 'documents-outline' },
];

export default function DiagramAskSheet({
  visible,
  onClose,
  selectedComponent,
  navigation,
}) {
  const {
    document,
    currentImageIndex,
    setCurrentImageIndex,
    setPendingQuestion,
    accessibilitySettings,
    isMultiPage,
  } = useMobileDocumentContext();

  const darkMode = !!accessibilitySettings?.darkMode;
  const p = getPalette(darkMode);
  const insets = useSafeAreaInsets();

  // Start on component scope if one is selected, otherwise diagram
  const defaultScope = selectedComponent ? 'component' : 'diagram';
  const [scope, setScope] = useState(defaultScope);
  const [input, setInput] = useState('');

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Reset state whenever sheet opens
  useEffect(() => {
    if (visible) {
      setScope(selectedComponent ? 'component' : 'diagram');
      setInput('');
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 220,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, selectedComponent]);

  // If the selected component is cleared while on component scope, fall back
  useEffect(() => {
    if (!selectedComponent && scope === 'component') setScope('diagram');
  }, [selectedComponent]);

  if (!visible && !document) return null;

  // ── Derived context label shown under scope tabs ──────────────

  const pages = document?.images || [];
  const currentPage = currentImageIndex >= 0 && pages[currentImageIndex]
    ? pages[currentImageIndex]
    : null;

  const contextLabel = (() => {
    if (scope === 'component' && selectedComponent) {
      return selectedComponent.label;
    }
    if (scope === 'diagram') {
      if (currentPage) return `Page ${currentPage.page || currentImageIndex + 1}`;
      return document?.file?.original_name?.replace(/\.[^.]+$/, '') || 'Diagram';
    }
    return document?.file?.original_name || document?.sessionName || 'Document';
  })();

  const presets = scope === 'component'
    ? COMPONENT_PRESETS
    : scope === 'diagram'
    ? DIAGRAM_PRESETS
    : DOCUMENT_PRESETS;

  // ── Submit ────────────────────────────────────────────────────

  const handleAsk = (question) => {
    const q = (question || input).trim();
    if (!q) return;

    // Adjust page scope based on the chosen scope
    if (scope === 'document') {
      setCurrentImageIndex(-1);
    } else if (scope === 'diagram') {
      // Keep current page index; if on "All" view, keep it
    }
    // For component scope, keep current page too

    setPendingQuestion(q);
    onClose();

    // Navigate to Chat tab
    try {
      navigation.getParent()?.navigate('Chat');
    } catch {
      navigation.navigate('Chat');
    }
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'position' : undefined}
        style={styles.kavWrapper}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: p.cardAbs,
              borderColor: p.border,
              borderTopColor: p.borderTop,
              paddingBottom: insets.bottom + 8,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Handle */}
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: p.muted }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: p.primaryGlass }]}>
              <Ionicons name="sparkles-outline" size={18} color={p.primary} />
            </View>
            <Text style={[styles.headerTitle, { color: p.text }]}>Ask AI</Text>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: p.cardSoftAbs }]}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={16} color={p.subtext} />
            </TouchableOpacity>
          </View>

          {/* Scope tabs */}
          <View style={[styles.scopeRow, { backgroundColor: p.cardSoftAbs, borderColor: p.border }]}>
            {SCOPES.map((s) => {
              const disabled = s.id === 'component' && !selectedComponent;
              const active = scope === s.id && !disabled;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.scopeTab,
                    active && { backgroundColor: p.primary },
                    disabled && { opacity: 0.35 },
                  ]}
                  onPress={() => !disabled && setScope(s.id)}
                  activeOpacity={disabled ? 1 : 0.75}
                  disabled={disabled}
                >
                  <Ionicons
                    name={s.icon}
                    size={13}
                    color={active ? '#fff' : p.subtext}
                  />
                  <Text style={[styles.scopeTabText, { color: active ? '#fff' : p.subtext }]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Context badge */}
          <View style={styles.contextRow}>
            <Ionicons name="pin-outline" size={12} color={p.muted} />
            <Text style={[styles.contextText, { color: p.muted }]} numberOfLines={1}>
              Context: <Text style={{ color: p.subtext, fontWeight: '600' }}>{contextLabel}</Text>
            </Text>
          </View>

          {/* Quick presets */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.presetsScroll}
            contentContainerStyle={styles.presetsContent}
          >
            {presets.map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[styles.presetChip, { borderColor: p.border, backgroundColor: p.cardSoftAbs }]}
                onPress={() => handleAsk(preset)}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetText, { color: p.text }]}>{preset}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Text input row */}
          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: p.cardSoftAbs,
                  borderColor: p.border,
                  color: p.text,
                },
              ]}
              placeholder="Or type your own question…"
              placeholderTextColor={p.muted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={400}
              returnKeyType="send"
              onSubmitEditing={() => handleAsk()}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: p.primary },
                !input.trim() && styles.sendBtnDisabled,
              ]}
              onPress={() => handleAsk()}
              disabled={!input.trim()}
              activeOpacity={0.82}
            >
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  kavWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 12,
  },

  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 14,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Scope tabs */
  scopeRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    gap: 2,
    marginBottom: 10,
  },
  scopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 11,
  },
  scopeTabText: { fontSize: 13, fontWeight: '600' },

  /* Context badge */
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  contextText: { fontSize: 12 },

  /* Presets */
  presetsScroll: { marginBottom: 12, marginHorizontal: -16 },
  presetsContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  presetText: { fontSize: 13, fontWeight: '500' },

  /* Input */
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 90,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2997ff',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: { opacity: 0.35, shadowOpacity: 0 },
});

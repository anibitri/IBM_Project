import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  Keyboard,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useMobileDocumentContext as useDocumentContext } from '../context/MobileDocumentContext';
import { timeAgo } from '@ar-viewer/shared';
import { spacing, getPalette } from '../styles/theme';
import { useSessionDrawer, DRAWER_WIDTH } from '../hooks/useSessionDrawer';
import { useTTS } from '../hooks/useTTS';

export default function ChatScreen({ navigation }) {
  const {
    document,
    chatHistory,
    askQuestion,
    loading,
    startNewChat,
    loadDemo,
    recentSessions,
    restoreSession,
    removeSession,
    renameSession,
    clearAllHistory,
    accessibilitySettings,
    pendingQuestion,
    consumePendingQuestion,
    currentImageIndex,
    setCurrentImageIndex,
    isMultiPage,
    attachDocumentToSession,
    addMessage,
    clearError,
  } = useDocumentContext();

  const [input, setInput] = useState('');
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const { visible: drawerVisible, translateX: drawerAnim, open: openDrawer, close: closeDrawer } = useSessionDrawer();
  const { speakingIndex, speak: speakMessage } = useTTS();

  const flatListRef = useRef(null);
  const inputRef = useRef(null);

  const darkMode = !!accessibilitySettings?.darkMode;
  const p = getPalette(darkMode);
  const insets = useSafeAreaInsets();

  /* ── Scroll to bottom ── */
  useEffect(() => {
    if (chatHistory.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chatHistory]);

  /* ── Keyboard scroll ── */
  useEffect(() => {
    const evt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(evt, () => {
      if (chatHistory.length > 0) flatListRef.current?.scrollToEnd({ animated: false });
    });
    return () => sub.remove();
  }, [chatHistory.length]);

  /* ── Pre-fill input from pending question (set by DiagramAskSheet) ── */
  useEffect(() => {
    if (pendingQuestion) {
      const q = consumePendingQuestion();
      if (q) {
        setInput(q);
        setTimeout(() => inputRef.current?.focus(), 150);
      }
    }
  }, [pendingQuestion]);

  /* ── Send ── */
  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput('');
    try {
      await askQuestion(q);
    } catch (e) {
      clearError();
      addMessage('assistant', '⚠️ Failed to get a response. Please try again.');
    }
  };

  /* ── Attach ── */
  const handlePlus = () => {
    if (!document?.file) {
      navigation.getParent()?.navigate('Home', { screen: 'Upload', params: { attachMode: true } });
      return;
    }
    Alert.alert('Attach', 'Add a file or image', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Gallery', onPress: () => navigation.navigate('Upload') },
      { text: 'Document', onPress: () => navigation.navigate('Upload') },
    ]);
  };

  /* ── Session actions ── */
  const handleRestoreSession = (s) => { restoreSession(s); closeDrawer(); };
  const handleDeleteSession = (s) =>
    Alert.alert('Remove Session', `Remove "${s.fileName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeSession(s.id) },
    ]);
  const openRename = (s) => { setRenameTargetId(s.id); setRenameValue(s.fileName || ''); setRenameVisible(true); };
  const openRenameForCurrent = () => {
    const currentSession = recentSessions.find(s => s.id === document?.sessionId);
    if (currentSession) openRename(currentSession);
  };
  const confirmRename = () => {
    if (renameTargetId) renameSession(renameTargetId, renameValue);
    setRenameVisible(false); setRenameTargetId(null); setRenameValue('');
  };
  const handleClearAll = () =>
    Alert.alert('Clear All History', 'This will remove all saved sessions.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: () => { clearAllHistory(); closeDrawer(); } },
    ]);

  const docName =
    document?.sessionName ||
    document?.file?.original_name?.replace(/\.[^.]+$/, '') ||
    'New Chat';

  /* ── Message renderer ── */
  const renderMessage = ({ item, index }) => {
    const isUser = item.role === 'user';
    if (isUser) {
      return (
        <View style={styles.userRow}>
          <View style={[styles.userBubble, { backgroundColor: p.primary }]}>
            <Text style={styles.userText}>{item.content}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.aiRow}>
        <View style={[styles.aiAvatar, { backgroundColor: p.primaryGlass, borderColor: p.border }]}>
          <Ionicons name="hardware-chip-outline" size={14} color={p.primary} />
        </View>
        <View style={[styles.aiBubble, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}>
          <Text style={[styles.aiText, { color: p.text }]}>{item.content}</Text>
          <TouchableOpacity style={styles.ttsBtn} onPress={() => speakMessage(item.content, index)}>
            <Ionicons
              name={speakingIndex === index ? 'stop-circle-outline' : 'volume-high-outline'}
              size={14}
              color={p.primary}
            />
            <Text style={[styles.ttsBtnText, { color: p.primary }]}>
              {speakingIndex === index ? 'Stop' : 'Listen'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /* ── History drawer ── */
  const historyDrawer = drawerVisible ? (
    <Modal transparent visible animationType="none" onRequestClose={closeDrawer}>
      <View style={styles.drawerOverlay}>
        <TouchableOpacity style={styles.drawerBackdrop} activeOpacity={1} onPress={closeDrawer} />
        <Animated.View
          style={[
            styles.drawerContainer,
            { backgroundColor: p.cardAbs, transform: [{ translateX: drawerAnim }] },
          ]}
        >
          <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
            {/* Drawer header */}
            <View style={[styles.drawerHeader, { borderBottomColor: p.border, paddingTop: insets.top + 14 }]}>
              <Text style={[styles.drawerTitle, { color: p.text }]}>History</Text>
              <TouchableOpacity
                style={[styles.drawerCloseBtn, { backgroundColor: p.cardSoftAbs }]}
                onPress={closeDrawer}
              >
                <Ionicons name="close" size={16} color={p.subtext} />
              </TouchableOpacity>
            </View>

            {/* Actions */}
            <View style={styles.drawerActions}>
              <TouchableOpacity
                style={[styles.drawerNewChat, { flex: 1, backgroundColor: p.primary, marginRight: document ? 8 : 0 }]}
                onPress={() => { startNewChat(); closeDrawer(); }}
                activeOpacity={0.82}
              >
                <Ionicons name="add-outline" size={18} color="#fff" />
                <Text style={styles.drawerNewChatText}>New Chat</Text>
              </TouchableOpacity>
              {document && (
                <TouchableOpacity
                  style={[styles.drawerDiagramBtn, { backgroundColor: p.cardSoftAbs, borderColor: p.border }]}
                  onPress={() => {
                    closeDrawer();
                    if (document?.file) {
                      navigation.getParent()?.navigate('Home', { screen: 'Diagram' });
                    } else {
                      navigation.getParent()?.navigate('Home', { screen: 'Upload', params: { attachMode: true } });
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name={document?.file ? 'layers-outline' : 'attach-outline'} size={16} color={p.primary} />
                  <Text style={[styles.drawerDiagramText, { color: p.text }]}>{document?.file ? 'Diagram' : 'Attach'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Session list */}
            <FlatList
              data={recentSessions}
              keyExtractor={(s) => s.id}
              style={styles.drawerList}
              contentContainerStyle={styles.drawerListContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={[styles.drawerEmpty, { color: p.muted }]}>No chat history yet</Text>
              }
              renderItem={({ item: session }) => {
                const isActive = document?.storedName === session.storedName;
                return (
                  <TouchableOpacity
                    style={[
                      styles.drawerItem,
                      { borderColor: 'transparent' },
                      isActive && { backgroundColor: p.primaryGlass, borderColor: p.border },
                    ]}
                    onPress={() => handleRestoreSession(session)}
                    onLongPress={() =>
                      Alert.alert('Session', 'Choose an action', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Rename', onPress: () => openRename(session) },
                        { text: 'Remove', style: 'destructive', onPress: () => handleDeleteSession(session) },
                      ])
                    }
                    activeOpacity={0.7}
                  >
                    <View style={styles.drawerItemTop}>
                      <Text
                        style={[styles.drawerItemName, { color: isActive ? p.primary : p.text }]}
                        numberOfLines={1}
                      >
                        {session.fileName || 'Untitled'}
                      </Text>
                      {isActive && <View style={[styles.activeDot, { backgroundColor: p.primary }]} />}
                    </View>
                    <View style={styles.drawerItemMeta}>
                      <Text style={[styles.drawerMetaText, { color: p.muted }]}>
                        {session.storedName
                          ? `${session.componentCount || 0} components`
                          : 'No diagram'}
                        {session.messageCount ? ` · ${session.messageCount} msgs` : ''}
                      </Text>
                      <Text style={[styles.drawerMetaText, { color: p.muted }]}>
                        {session.timestamp ? timeAgo(session.timestamp) : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            {/* Clear all */}
            {recentSessions.length > 0 && (
              <TouchableOpacity
                style={[styles.drawerClearBtn, { borderColor: 'rgba(255,69,58,0.3)' }]}
                onPress={handleClearAll}
              >
                <Ionicons name="trash-outline" size={14} color={p.error} style={{ marginRight: 6 }} />
                <Text style={[styles.drawerClearText, { color: p.error }]}>Clear All History</Text>
              </TouchableOpacity>
            )}
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  ) : null;

  /* ── Rename modal ── */
  const renameModal = renameVisible ? (
    <Modal transparent visible animationType="fade" onRequestClose={() => setRenameVisible(false)}>
      <View style={[styles.renameOverlay, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
        <View style={[styles.renameCard, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}>
          <Text style={[styles.renameTitle, { color: p.text }]}>Rename Session</Text>
          <TextInput
            style={[styles.renameInput, { color: p.text, borderColor: p.border, backgroundColor: p.cardSoftAbs }]}
            value={renameValue}
            onChangeText={setRenameValue}
            placeholder="Session name"
            placeholderTextColor={p.muted}
            autoFocus
            maxLength={80}
          />
          <View style={styles.renameActions}>
            <TouchableOpacity style={styles.renameBtn} onPress={() => setRenameVisible(false)}>
              <Text style={[styles.renameBtnText, { color: p.subtext }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.renameBtn, styles.renameBtnPrimary, { backgroundColor: p.primary }]} onPress={confirmRename}>
              <Text style={[styles.renameBtnText, { color: '#fff' }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  ) : null;

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: p.bg }]}>
      {historyDrawer}
      {renameModal}

      {/* Header */}
      <View style={[styles.header, { backgroundColor: p.bg, borderBottomColor: p.border }]}>
        <TouchableOpacity
          style={[styles.menuBtn, { backgroundColor: p.cardSoftAbs }]}
          onPress={openDrawer}
          activeOpacity={0.7}
        >
          <Ionicons name="menu-outline" size={22} color={p.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={openRenameForCurrent}
          activeOpacity={0.7}
          disabled={!document}
        >
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: p.text }]} numberOfLines={1}>{docName}</Text>
            {document && <Ionicons name="pencil-outline" size={12} color={p.muted} />}
          </View>
          <Text style={[styles.headerSub, { color: p.muted }]}>AI ASSISTANT</Text>
          {!document?.file && document && (
            <TouchableOpacity
              onPress={() => navigation.getParent()?.navigate('Home', { screen: 'Upload', params: { attachMode: true } })}
              activeOpacity={0.75}
              style={[styles.noFilePill, { backgroundColor: p.primaryGlass, borderColor: p.primary + '44' }]}
            >
              <Ionicons name="attach-outline" size={10} color={p.primary} />
              <Text style={[styles.noFilePillText, { color: p.primary }]}>Attach diagram</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.menuBtn, { backgroundColor: p.cardSoftAbs }]}
          onPress={() => {
            if (document?.file) {
              navigation.getParent()?.navigate('Home', { screen: 'Diagram' });
            } else {
              navigation.getParent()?.navigate('Home', { screen: 'Upload', params: { attachMode: true } });
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name={document?.file ? 'layers-outline' : 'attach-outline'} size={20} color={p.primary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Empty state */}
        {chatHistory.length === 0 ? (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: p.primaryGlass, borderColor: p.border }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={32} color={p.primary} />
              </View>
              {document?.file ? (
                <>
                  <Text style={[styles.emptyTitle, { color: p.text }]}>Ask about your diagram</Text>
                  <Text style={[styles.emptyHint, { color: p.subtext }]}>
                    Ask questions about components, connections and architecture.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.emptyTitle, { color: p.text }]}>Ask me anything</Text>
                  <Text style={[styles.emptyHint, { color: p.subtext }]}>
                    Chat freely, or attach a diagram for component analysis and AI Q&A.
                  </Text>
                  <TouchableOpacity
                    style={[styles.attachDiagramBtn, { backgroundColor: p.primary }]}
                    onPress={() => navigation.getParent()?.navigate('Home', { screen: 'Upload', params: { attachMode: true } })}
                    activeOpacity={0.82}
                  >
                    <Ionicons name="attach-outline" size={18} color="#fff" />
                    <Text style={styles.attachDiagramBtnText}>Attach Diagram</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatHistory}
            keyExtractor={(_, i) => i.toString()}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
          />
        )}

        {/* Typing indicator */}
        {loading && (
          <View style={[styles.typingRow, { backgroundColor: p.bg }]}>
            <ActivityIndicator size="small" color={p.primary} />
            <Text style={[styles.typingText, { color: p.subtext }]}>Thinking…</Text>
          </View>
        )}

        {/* Page scope chips — multi-page documents only */}
        {isMultiPage && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.scopeRow, { backgroundColor: p.bg, borderTopColor: p.border }]}
            contentContainerStyle={styles.scopeRowContent}
          >
            <TouchableOpacity
              style={[styles.scopeChip, { borderColor: currentImageIndex === -1 ? p.primary : p.border, backgroundColor: currentImageIndex === -1 ? p.primaryGlass : p.cardAbs }]}
              onPress={() => setCurrentImageIndex(-1)}
              activeOpacity={0.7}
            >
              <Ionicons name="documents-outline" size={11} color={currentImageIndex === -1 ? p.primary : p.subtext} />
              <Text style={[styles.scopeChipText, { color: currentImageIndex === -1 ? p.primary : p.subtext }]}>Document</Text>
            </TouchableOpacity>
            {(document?.images || []).map((pg, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.scopeChip, { borderColor: currentImageIndex === idx ? p.primary : p.border, backgroundColor: currentImageIndex === idx ? p.primaryGlass : p.cardAbs }]}
                onPress={() => setCurrentImageIndex(idx)}
                activeOpacity={0.7}
              >
                <Text style={[styles.scopeChipText, { color: currentImageIndex === idx ? p.primary : p.subtext }]}>
                  Page {pg.page || idx + 1}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, {
          backgroundColor: p.bg,
          borderTopColor: p.border,
        }]}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: p.cardSoftAbs }]}
            onPress={handlePlus}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color={p.text} />
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            style={[styles.input, { backgroundColor: p.cardAbs, borderColor: p.border, color: p.text }]}
            placeholder="Message…"
            placeholderTextColor={p.muted}
            value={input}
            onChangeText={setInput}
            editable={!loading}
            multiline
            maxLength={500}
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: p.primary },
              (!input.trim() || loading) && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={!input.trim() || loading}
            activeOpacity={0.82}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  headerSub: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginTop: 1 },

  /* Empty state */
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 14 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  /* Messages */
  messagesList: { padding: spacing.md, paddingBottom: 8 },

  /* User bubble */
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
  userBubble: {
    borderRadius: 20,
    borderBottomRightRadius: 5,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '78%',
  },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },

  /* AI bubble */
  aiRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 2,
    borderWidth: 1,
  },
  aiBubble: {
    borderRadius: 20,
    borderBottomLeftRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '78%',
    borderWidth: 1,
  },
  aiText: { fontSize: 15, lineHeight: 21 },
  ttsBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4, alignSelf: 'flex-end' },
  ttsBtnText: { fontSize: 12, fontWeight: '600' },

  /* Typing */
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  typingText: { fontSize: 13 },

  /* Scope chips */
  scopeRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: 44,
  },
  scopeRowContent: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  scopeChipText: { fontSize: 12, fontWeight: '600' },

  /* Input bar */
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2997ff',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: { opacity: 0.35, shadowOpacity: 0 },

  /* Drawer */
  drawerOverlay: { flex: 1, flexDirection: 'row' },
  drawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  drawerContainer: {
    width: DRAWER_WIDTH,
    zIndex: 10,
    elevation: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 6, height: 0 }, shadowOpacity: 0.35, shadowRadius: 16 },
    }),
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  drawerCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerActions: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginTop: 14,
    marginBottom: 8,
    gap: 8,
  },
  drawerNewChat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 6,
    shadowColor: '#2997ff',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  drawerNewChatText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  drawerDiagramBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  drawerDiagramText: { fontSize: 14, fontWeight: '600' },
  drawerList: { flex: 1 },
  drawerListContent: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 16 },
  drawerEmpty: { textAlign: 'center', fontSize: 14, paddingTop: 40 },
  drawerItem: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
    borderWidth: 1,
  },
  drawerItemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  drawerItemName: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  drawerItemMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  drawerMetaText: { fontSize: 12 },
  drawerClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 14,
    marginBottom: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  drawerClearText: { fontSize: 14, fontWeight: '600' },

  /* Attach diagram button (empty state) */
  attachDiagramBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
    shadowColor: '#2997ff',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  attachDiagramBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  /* No-file pill in header */
  noFilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  noFilePillText: { fontSize: 10, fontWeight: '600' },

  /* Rename modal */
  renameOverlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  renameCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  renameTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14, letterSpacing: -0.2 },
  renameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 16,
  },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  renameBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 100 },
  renameBtnPrimary: { shadowColor: '#2997ff', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 3 },
  renameBtnText: { fontSize: 15, fontWeight: '600' },
});

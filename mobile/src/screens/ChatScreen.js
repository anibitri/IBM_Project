import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Modal,
  Animated,
  Dimensions,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Bare React Native Replacements
import Ionicons from 'react-native-vector-icons/Ionicons';
import Tts from 'react-native-tts';

import { useMobileDocumentContext as useDocumentContext } from '../context/MobileDocumentContext';
import { spacing } from '../styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

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
  } = useDocumentContext();
  const [input, setInput] = useState('');
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const flatListRef = useRef(null);
  const inputRef = useRef(null);

  const insets = useSafeAreaInsets();
  const HEADER_HEIGHT = 54; // paddingTop(8) + icon(36) + paddingBottom(10)

  const darkMode = !!accessibilitySettings?.darkMode;
  const palette = darkMode
    ? {
        bg: '#121417',
        header: '#121417',
        card: '#1b1f24',
        cardSoft: '#242a31',
        text: '#f4f7fb',
        subtext: '#9aa3ad',
        border: '#303741',
        primary: '#4ea3ff',
      }
    : {
        bg: '#f2f2f7',
        header: '#f2f2f7',
        card: '#ffffff',
        cardSoft: '#e5e5ea',
        text: '#000000',
        subtext: '#8e8e93',
        border: '#d1d1d6',
        primary: '#007AFF',
      };

  useEffect(() => {
    if (chatHistory.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chatHistory]);

  /* ── Initialize TTS and global listeners ── */
  useEffect(() => {
    Tts.getInitStatus()
      .then(() => {
        try {
          Tts.setDefaultLanguage('en-US');
          Tts.setDefaultRate(0.5);
        } catch (e) {
          console.warn('TTS config failed:', e);
        }
      })
      .catch((err) => {
        console.warn('TTS not available:', err);
      });

    const finishListener = Tts.addEventListener('tts-finish', () => setSpeakingIndex(null));
    const cancelListener = Tts.addEventListener('tts-cancel', () => setSpeakingIndex(null));

    return () => {
      try { Tts.stop(); } catch (e) {}
      try { finishListener?.remove(); } catch (e) {}
      try { cancelListener?.remove(); } catch (e) {}
    };
  }, []);

  /* Scroll to bottom when keyboard appears */
  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, () => {
      if (chatHistory.length > 0) {
        flatListRef.current?.scrollToEnd({ animated: false });
      }
    });
    return () => sub.remove();
  }, [chatHistory.length]);

  /* Drawer open / close */
  const openDrawer = () => {
    setDrawerVisible(true);
    Animated.spring(drawerAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(drawerAnim, {
      toValue: -DRAWER_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setDrawerVisible(false));
  };

  /* Load a doc first if none is loaded */
  const ensureDoc = async () => {
    if (!document) {
      await loadDemo();
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    await ensureDoc();
    const query = input.trim();
    setInput('');
    try {
      await askQuestion(query);
    } catch (err) {
      console.error('Chat error:', err);
    }
  };

  const handlePlus = () => {
    Alert.alert('Attach', 'Attach a file or image to the conversation', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Gallery', onPress: () => navigation.navigate('Upload') },
      { text: 'Document', onPress: () => navigation.navigate('Upload') },
    ]);
  };

  const handleRestoreSession = (session) => {
    restoreSession(session);
    closeDrawer();
  };

  const handleDeleteSession = (session) => {
    Alert.alert(
      'Remove Session',
      `Remove "${session.fileName}" from history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeSession(session.id),
        },
      ],
    );
  };

  const openRenameSession = (session) => {
    setRenameTargetId(session.id);
    setRenameValue(session.fileName || '');
    setRenameVisible(true);
  };

  const confirmRename = () => {
    if (!renameTargetId) return;
    renameSession(renameTargetId, renameValue);
    setRenameVisible(false);
    setRenameTargetId(null);
    setRenameValue('');
  };

  const handleClearAll = () => {
    Alert.alert('Clear All History', 'This will remove all saved sessions.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: () => { clearAllHistory(); closeDrawer(); } },
    ]);
  };

  const docName =
    document?.sessionName ||
    document?.file?.original_name?.replace(/\.[^.]+$/, '') ||
    'New Chat';

  const handleVoiceAsk = () => {
    inputRef.current?.focus();
    Alert.alert(
      'Voice Question',
      'Use your keyboard microphone button to dictate text in the input field.',
      [{ text: 'OK' }],
    );
  };

  /* ── Native TTS Execution ── */
  const speakMessage = (content, idx) => {
    try {
      if (speakingIndex === idx) {
        Tts.stop();
        setSpeakingIndex(null);
        return;
      }
      Tts.stop();
      setSpeakingIndex(idx);
      Tts.speak(content);
    } catch (e) {
      console.warn('TTS speak failed:', e);
      setSpeakingIndex(null);
    }
  };

  /* ── Render a single message ── */
  const renderMessage = ({ item, index }) => {
    const isUser = item.role === 'user';
    if (isUser) {
      return (
        <View style={styles.userRow}>
          <View style={[styles.userBubble, { backgroundColor: palette.primary }]}>
            <Text style={styles.userText}>{item.content}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.aiRow}>
        <View style={styles.aiAvatar}>
          <Text style={styles.aiAvatarText}>AI</Text>
        </View>
        <View style={[styles.aiBubble, { backgroundColor: palette.card, borderColor: palette.border }]}> 
          <Text style={[styles.aiText, { color: palette.text }]}>{item.content}</Text>
          <TouchableOpacity
            style={styles.ttsButton}
            onPress={() => speakMessage(item.content, index)}
          >
            <Ionicons
              name={speakingIndex === index ? 'stop-circle-outline' : 'volume-high-outline'}
              size={16}
              color={palette.primary}
            />
            <Text style={[styles.ttsButtonText, { color: palette.primary }]}>
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
        <TouchableOpacity
          style={styles.drawerBackdrop}
          activeOpacity={1}
          onPress={closeDrawer}
        />
        <Animated.View
          style={[
            styles.drawerContainer,
            { transform: [{ translateX: drawerAnim }], backgroundColor: palette.card },
          ]}
        >
          <SafeAreaView style={styles.drawerSafe}>
            {/* Drawer header */}
            <View style={[styles.drawerHeader, { borderBottomColor: palette.border }]}>
              <Text style={[styles.drawerTitle, { color: palette.text }]}>History</Text>
              <TouchableOpacity onPress={closeDrawer} style={[styles.drawerCloseBtn, { backgroundColor: palette.cardSoft }]}>
                <Text style={[styles.drawerCloseText, { color: palette.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Action buttons row */}
            <View style={styles.drawerActions}>
              <TouchableOpacity
                style={[styles.drawerNewChat, { flex: 1, marginRight: document ? 8 : 0 }]}
                onPress={() => { startNewChat(); closeDrawer(); }}
              >
                <Text style={styles.drawerNewChatIcon}>+</Text>
                <Text style={styles.drawerNewChatText}>New Chat</Text>
              </TouchableOpacity>
              {document && (
                <TouchableOpacity
                  style={styles.drawerDiagramBtn}
                  onPress={() => {
                    closeDrawer();
                    navigation.getParent()?.navigate('Home', { screen: 'Diagram' });
                  }}
                >
                  <Ionicons name="layers-outline" size={16} color="#fff" />
                  <Text style={styles.drawerDiagramText}>Diagram</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Session list */}
            <FlatList
              data={recentSessions}
              keyExtractor={(s) => s.id}
              style={styles.drawerList}
              contentContainerStyle={styles.drawerListContent}
              ListEmptyComponent={
                <Text style={[styles.drawerEmptyText, { color: palette.subtext }]}>No chat history yet</Text>
              }
              renderItem={({ item: session }) => {
                const isActive = document?.storedName === session.storedName;
                return (
                  <TouchableOpacity
                    style={[styles.drawerItem, isActive && styles.drawerItemActive]}
                    onPress={() => handleRestoreSession(session)}
                    onLongPress={() =>
                      Alert.alert('Session', 'Choose an action', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Rename', onPress: () => openRenameSession(session) },
                        { text: 'Remove', style: 'destructive', onPress: () => handleDeleteSession(session) },
                      ])
                    }
                    activeOpacity={0.7}
                  >
                    <View style={styles.drawerItemTop}>
                      <Text
                        style={[styles.drawerItemName, { color: palette.text }, isActive && styles.drawerItemNameActive]}
                        numberOfLines={1}
                      >
                        {session.fileName || 'Untitled'}
                      </Text>
                      {isActive && <View style={styles.activeDot} />}
                    </View>
                    <View style={styles.drawerItemBottom}>
                      <Text style={[styles.drawerItemMeta, { color: palette.subtext }]}>
                        {session.componentCount || 0} components
                        {session.messageCount ? ` · ${session.messageCount} msgs` : ''}
                      </Text>
                      <Text style={[styles.drawerItemTime, { color: palette.subtext }]}>
                        {session.timestamp ? timeAgo(session.timestamp) : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            {/* Clear all */}
            {recentSessions.length > 0 && (
              <TouchableOpacity style={styles.drawerClearBtn} onPress={handleClearAll}>
                <Text style={styles.drawerClearText}>Clear All History</Text>
              </TouchableOpacity>
            )}
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  ) : null;

  const renameModal = renameVisible ? (
    <Modal transparent visible animationType="fade" onRequestClose={() => setRenameVisible(false)}>
      <View style={styles.renameOverlay}>
        <View style={[styles.renameCard, { backgroundColor: palette.card }]}> 
          <Text style={[styles.renameTitle, { color: palette.text }]}>Rename History Item</Text>
          <TextInput
            style={[
              styles.renameInput,
              {
                color: palette.text,
                borderColor: palette.border,
                backgroundColor: palette.cardSoft,
              },
            ]}
            value={renameValue}
            onChangeText={setRenameValue}
            placeholder="Session name"
            placeholderTextColor={palette.subtext}
            autoFocus
            maxLength={80}
          />
          <View style={styles.renameActions}>
            <TouchableOpacity style={styles.renameBtn} onPress={() => setRenameVisible(false)}>
              <Text style={[styles.renameBtnText, { color: palette.subtext }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.renameBtn} onPress={confirmRename}>
              <Text style={[styles.renameBtnText, { color: palette.primary, fontWeight: '700' }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  ) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]}>
      {historyDrawer}
      {renameModal}

      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.header, borderBottomColor: palette.border }]}>
        <TouchableOpacity style={[styles.menuBtn, { backgroundColor: palette.cardSoft }]} onPress={openDrawer}>
          <Ionicons name="menu-outline" size={26} color={palette.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>
            {docName}
          </Text>
          <Text style={[styles.headerSub, { color: palette.subtext }]}>CHAT</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + HEADER_HEIGHT : 0}
      >
        {/* Messages */}
        {chatHistory.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyText, { color: palette.subtext }]}>
              Send a message to start chatting about your document.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatHistory}
            keyExtractor={(_, i) => i.toString()}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}

        {/* Typing indicator */}
        {loading && (
          <View style={styles.typingRow}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.typingText}>Thinking...</Text>
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: palette.bg, borderTopColor: palette.border }]}>
          <TouchableOpacity style={[styles.plusBtn, { backgroundColor: palette.cardSoft }]} onPress={handlePlus}>
            <Text style={[styles.plusText, { color: palette.text }]}>+</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.plusBtn, { backgroundColor: palette.cardSoft }]} onPress={handleVoiceAsk}>
            <Ionicons name="mic-outline" size={18} color={palette.primary} />
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            style={[styles.input, { backgroundColor: palette.card, borderColor: palette.border, color: palette.text }]}
            placeholder="Type a message..."
            placeholderTextColor={palette.subtext}
            value={input}
            onChangeText={setInput}
            editable={!loading}
            multiline
            maxLength={500}
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: palette.primary },
              (!input.trim() || loading) && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ... styles remain completely unchanged
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f2f2f7' },
  flex: { flex: 1 },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#f2f2f7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d1d1d6',
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e5e5ea',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIcon: { fontSize: 18, color: '#333' },
  headerCenter: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  tagIcon: { fontSize: 14 },
  headerSub: { fontSize: 12, color: '#8e8e93', fontWeight: '500', marginTop: 1 },

  /* Messages */
  messagesList: {
    padding: spacing.md,
    paddingBottom: 8,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 40,
  },
  emptyText: { color: '#8e8e93', fontSize: 15, textAlign: 'center' },

  /* User bubble */
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  userBubble: {
    backgroundColor: '#007AFF',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '75%',
  },
  userText: { color: '#fff', fontSize: 16, lineHeight: 22 },

  /* AI bubble */
  aiRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  aiAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#34c759',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 2,
  },
  aiAvatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  aiBubble: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '75%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  aiText: { color: '#000', fontSize: 16, lineHeight: 22 },
  ttsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 8,
    gap: 4,
  },
  ttsButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },

  /* Typing */
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  typingText: { color: '#8e8e93', fontSize: 13, marginLeft: 6 },

  /* Input bar */
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#f2f2f7',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d1d1d6',
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e5e5ea',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  plusText: { fontSize: 22, color: '#333', fontWeight: '400', marginTop: -1 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d1d6',
  },
  sendBtn: {
    marginLeft: 8,
    backgroundColor: '#007AFF',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#b0b0b0',
  },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  /* ── History Drawer ── */
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawerContainer: {
    width: DRAWER_WIDTH,
    backgroundColor: '#1c1c1e',
    zIndex: 10,
    elevation: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
    }),
  },
  drawerSafe: {
    flex: 1,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  drawerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  drawerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  drawerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
  },
  drawerNewChat: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#007AFF',
    borderRadius: 12,
  },
  drawerDiagramBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    gap: 6,
  },
  drawerDiagramText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  drawerNewChatIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginRight: 8,
  },
  drawerNewChatText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  drawerList: {
    flex: 1,
  },
  drawerListContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 16,
  },
  drawerEmptyText: {
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    fontSize: 14,
    paddingTop: 40,
  },
  drawerItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  drawerItemActive: {
    backgroundColor: 'rgba(0,122,255,0.18)',
  },
  drawerItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerItemName: {
    color: '#e5e5ea',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  drawerItemNameActive: {
    color: '#007AFF',
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
  drawerItemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  drawerItemMeta: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
  drawerItemTime: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
  },
  drawerClearBtn: {
    marginHorizontal: 16,
    marginBottom: 20,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.4)',
  },
  drawerClearText: {
    color: '#ff3b30',
    fontSize: 15,
    fontWeight: '600',
  },
  renameOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  renameCard: {
    borderRadius: 14,
    padding: 16,
  },
  renameTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  renameInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 18,
  },
  renameBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  renameBtnText: {
    fontSize: 15,
  },
});
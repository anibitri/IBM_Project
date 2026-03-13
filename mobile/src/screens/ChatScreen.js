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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

export default function ChatScreen() {
  const {
    document,
    chatHistory,
    askQuestion,
    loading,
    clearChat,
    loadDemo,
    recentSessions,
    restoreSession,
    removeSession,
    clearAllHistory,
  } = useDocumentContext();
  const [input, setInput] = useState('');
  const [drawerVisible, setDrawerVisible] = useState(false);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const flatListRef = useRef(null);

  useEffect(() => {
    if (chatHistory.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chatHistory]);

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
      { text: 'Gallery', onPress: () => {} },
      { text: 'Document', onPress: () => {} },
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

  const handleClearAll = () => {
    Alert.alert('Clear All History', 'This will remove all saved sessions.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: () => { clearAllHistory(); closeDrawer(); } },
    ]);
  };

  const docName = document?.file?.original_name?.replace(/\.[^.]+$/, '') || 'New Chat';

  /* ── Render a single message ── */
  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    if (isUser) {
      return (
        <View style={styles.userRow}>
          <View style={styles.userBubble}>
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
        <View style={styles.aiBubble}>
          <Text style={styles.aiText}>{item.content}</Text>
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
            { transform: [{ translateX: drawerAnim }] },
          ]}
        >
          <SafeAreaView style={styles.drawerSafe}>
            {/* Drawer header */}
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>History</Text>
              <TouchableOpacity onPress={closeDrawer} style={styles.drawerCloseBtn}>
                <Text style={styles.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* New chat button */}
            <TouchableOpacity
              style={styles.drawerNewChat}
              onPress={() => { clearChat(); closeDrawer(); }}
            >
              <Text style={styles.drawerNewChatIcon}>+</Text>
              <Text style={styles.drawerNewChatText}>New Chat</Text>
            </TouchableOpacity>

            {/* Session list */}
            <FlatList
              data={recentSessions}
              keyExtractor={(s) => s.id}
              style={styles.drawerList}
              contentContainerStyle={styles.drawerListContent}
              ListEmptyComponent={
                <Text style={styles.drawerEmptyText}>No chat history yet</Text>
              }
              renderItem={({ item: session }) => {
                const isActive = document?.storedName === session.storedName;
                return (
                  <TouchableOpacity
                    style={[styles.drawerItem, isActive && styles.drawerItemActive]}
                    onPress={() => handleRestoreSession(session)}
                    onLongPress={() => handleDeleteSession(session)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.drawerItemTop}>
                      <Text
                        style={[styles.drawerItemName, isActive && styles.drawerItemNameActive]}
                        numberOfLines={1}
                      >
                        {session.fileName || 'Untitled'}
                      </Text>
                      {isActive && <View style={styles.activeDot} />}
                    </View>
                    <View style={styles.drawerItemBottom}>
                      <Text style={styles.drawerItemMeta}>
                        {session.componentCount || 0} components
                        {session.messageCount ? ` · ${session.messageCount} msgs` : ''}
                      </Text>
                      <Text style={styles.drawerItemTime}>
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

  return (
    <SafeAreaView style={styles.safe}>
      {historyDrawer}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={openDrawer}>
          <Ionicons name="menu-outline" size={26} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {docName}
          </Text>
          <Text style={styles.headerSub}>CHAT</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages */}
        {chatHistory.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
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
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.plusBtn} onPress={handlePlus}>
            <Text style={styles.plusText}>+</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            value={input}
            onChangeText={setInput}
            editable={!loading}
            multiline
            maxLength={500}
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
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
  headerCenter: { marginLeft: 12 },
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
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
  drawerNewChat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#007AFF',
    borderRadius: 12,
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
});

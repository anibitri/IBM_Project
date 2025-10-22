import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useHistory } from '../context/HistoryContext';

export default function ChatScreen({ route, navigation }) {
  const { history } = useHistory();
  const docId = route?.params?.docId;
  const selected = Array.isArray(history) ? history.find((item) => item?.id === docId) : undefined;

  // Menu-like modal for switching conversations
  const [historyVisible, setHistoryVisible] = React.useState(false);
  const openHistory = () => setHistoryVisible(true);
  const closeHistory = () => setHistoryVisible(false);
  const handleSelect = (item) => {
    navigation.setParams({ docId: item?.id });
    closeHistory();
  };

  return (
    <View style={styles.container}>
      {/* History menu button */}
      <View style={styles.menuWrapper}>
        <TouchableOpacity style={styles.historyButton} onPress={openHistory}>
          <Text style={styles.historyButtonText}>History</Text>
        </TouchableOpacity>
      </View>

      {/* ...existing code... */}
      <Text style={styles.text}>This is the Chat Screen</Text>
      <View style={{ padding: 16 }}>
        {selected ? (
          <Text style={{ marginBottom: 8 }}>Chatting about: {selected.name}</Text>
        ) : (
          <Text style={{ marginBottom: 8 }}>Select a document from Home to start context.</Text>
        )}
        <Text style={{ fontWeight: '600', marginTop: 16, marginBottom: 8 }}>History</Text>
        {(Array.isArray(history) ? history : []).map((item, index) => (
          <Text key={item?.id != null ? String(item.id) : `row-${index}`} style={{ marginVertical: 4 }}>
            {item?.name ?? 'Untitled'}
          </Text>
        ))}
      </View>

      {/* History picker modal */}
      <Modal
        visible={historyVisible}
        animationType="fade"
        transparent
        onRequestClose={closeHistory}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Switch conversation</Text>

            {(Array.isArray(history) ? history : []).map((item, index) => {
              const key = item?.id != null ? String(item.id) : `row-${index}`;
              const active = item?.id === docId;
              return (
                <TouchableOpacity key={key} style={styles.modalItem} onPress={() => handleSelect(item)}>
                  <Text style={{ fontWeight: active ? '700' : '500' }}>
                    {item?.name ?? 'Untitled'}
                  </Text>
                  {item?.createdAt ? (
                    <Text style={{ color: '#6c757d', fontSize: 12 }}>
                      {new Date(item.createdAt).toLocaleString()}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.modalClose} onPress={closeHistory}>
              <Text>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 18 },
  // New styles
  menuWrapper: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  historyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  historyButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e9ecef',
  },
  modalClose: {
    alignSelf: 'flex-end',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f1f3f5',
  },
});

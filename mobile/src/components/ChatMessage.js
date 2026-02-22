import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../styles/theme';

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.container, isUser && styles.containerUser]}>
      <View style={styles.avatarContainer}>
        <Text style={styles.avatar}>{isUser ? '👤' : '🤖'}</Text>
      </View>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.text, isUser && styles.textUser]}>{message.content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  containerUser: {
    flexDirection: 'row-reverse',
  },
  avatarContainer: {
    marginHorizontal: spacing.sm,
  },
  avatar: {
    fontSize: 24,
  },
  bubble: {
    maxWidth: '70%',
    padding: spacing.md,
    borderRadius: 16,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  text: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
  },
  textUser: {
    color: colors.white,
  },
});
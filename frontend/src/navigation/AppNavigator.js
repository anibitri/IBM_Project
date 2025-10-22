import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from '../screens/HomeScreen';
import CameraScreen from '../screens/CameraScreen';
import UploadScreen from '../screens/UploadScreen';
import { HistoryProvider } from '../context/HistoryContext';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <HistoryProvider>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
        <Stack.Screen name="Scan" component={CameraScreen} options={{ title: 'Scan Document' }} />
        <Stack.Screen name="Upload" component={UploadScreen} options={{ title: 'Upload Document' }} />
      </Stack.Navigator>
    </HistoryProvider>
  );
}

import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, TouchableOpacity, PermissionAndroid, Platform } from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import { colors, radii } from '../styles/theme';

export default function CameraScreen({ navigation }) {
    const [permission, setPermission] = useState(false);
    const devices = useCameraDevices();
    const device = devices.back;

    useEffect(() => {
        (async () => {
            const newCameraPermission = await Camera.requestCameraPermission();
            setPermission(newCameraPermission === 'authorized');
        })();
    }, []);

    if(!device) return <Text>Loading Camera...</Text>;

    return (
        <View style={styles.container}>
            {permission ? (
                <Camera
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive={true}
                />
            ) : (
                <Text>No camera permission granted.</Text>
            )}
            <TouchableOpacity style={styles.button}>
                <Text style={styles.text}>Capture Diagram</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1},
    button: {
        position: 'absolute',
    bottom: 50,
    left: '25%',
    right: '25%',
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: radii.md,
  },
  text: { color: colors.textOnPrimary, textAlign: 'center', fontWeight: '700', fontSize: 16 },
});
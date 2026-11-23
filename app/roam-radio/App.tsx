import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { AppRoot } from './src/ui/AppRoot.tsx';

export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <AppRoot />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1120' },
});

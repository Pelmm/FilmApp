import { StyleSheet, Text, View } from 'react-native';

// Ska inte registreras i navigatorn förrän riktig autentisering finns.
export default function MyReviewsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mina recensioner</Text>
      <Text style={styles.message}>Här kommer dina recensioner att visas när inloggning finns.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020', padding: 24, justifyContent: 'center' },
  title: { color: '#f5f7fb', fontSize: 26, fontWeight: 'bold', marginBottom: 16 },
  message: { color: '#c0cadb', fontSize: 16, lineHeight: 24 },
});

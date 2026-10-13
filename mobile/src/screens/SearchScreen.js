import { StyleSheet, Text, View } from 'react-native';

export default function SearchScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sök filmer</Text>
      <Text style={styles.message}>Här kommer du kunna söka efter filmer.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020', padding: 24, justifyContent: 'center' },
  title: { color: '#f5f7fb', fontSize: 26, fontWeight: 'bold', marginBottom: 16 },
  message: { color: '#c0cadb', fontSize: 16, lineHeight: 24 },
});

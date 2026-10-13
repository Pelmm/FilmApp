import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function RegisterScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Registrera konto</Text>
      <Text style={styles.message}>Registrering kommer i ett senare steg.</Text>
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.buttonText}>Tillbaka till inloggning</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020', padding: 24, justifyContent: 'center' },
  title: { color: '#f5f7fb', fontSize: 26, fontWeight: 'bold', marginBottom: 16 },
  message: { color: '#c0cadb', fontSize: 16, lineHeight: 24, marginBottom: 24 },
  button: { backgroundColor: '#f5c563', minHeight: 48, padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#0b1020', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
});

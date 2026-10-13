import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function LoginScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Logga in</Text>
      <Text style={styles.message}>Inloggning kommer i ett senare steg. Du behöver vara inloggad för att se Mina recensioner.</Text>
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        onPress={() => navigation.navigate('Register')}
      >
        <Text style={styles.buttonText}>Registrera konto</Text>
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

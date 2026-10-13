import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, View } from 'react-native';
import { getHealth } from '../services/api';

export default function HomeScreen() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function checkHealth() {
      setState({ loading: true, data: null, error: null });
      try {
        const data = await getHealth({ signal: controller.signal });
        if (active) setState({ loading: true, data, error: null });
      } catch (error) {
        if (active && error.name !== 'AbortError') {
          setState({ loading: true, data: null, error: error.message });
        }
      } finally {
        if (active) setState((current) => ({ ...current, loading: false }));
      }
    }

    checkHealth();

    // Avbryt både nätverksanropet och framtida state-uppdateringar.
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FilmApp</Text>
      <View style={styles.status} accessibilityLiveRegion="polite">
        {state.loading ? (
          <>
            <ActivityIndicator size="large" accessibilityLabel="Kontrollerar anslutningen till servern" />
            <Text style={styles.message}>Kontrollerar anslutningen till servern…</Text>
          </>
        ) : state.error ? (
          <>
            <Text style={[styles.message, styles.error]}>{state.error}</Text>
            <Button title="Försök igen" onPress={() => setAttempt((current) => current + 1)} />
          </>
        ) : (
          <>
            <Text style={[styles.message, styles.success]}>Ansluten till backend.</Text>
            <Text>Serverstatus: {state.data.status}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 12 },
  status: { alignItems: 'center', width: '100%', maxWidth: 420 },
  message: { textAlign: 'center', marginVertical: 16, fontSize: 16 },
  error: { color: '#b42318' },
  success: { color: '#146c2e' },
});

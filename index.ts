import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent s'assure que l'application démarre correctement 
// sur Android, iOS et Expo Go.
registerRootComponent(App);
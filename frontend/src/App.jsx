import AppRoutes from './routes/AppRoutes.jsx';
import { ToastProvider } from './components/common/Toast.jsx';

function App() {
  return (
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  );
}

export default App;

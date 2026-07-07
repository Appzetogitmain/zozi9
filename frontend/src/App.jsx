import { Suspense } from 'react';
import AppRouter from '@core/routes/AppRouter';
import { AuthProvider } from '@core/context/AuthContext';
import { SettingsProvider } from '@core/context/SettingsContext';
import { SupportUnreadProvider } from '@core/context/SupportUnreadContext';
import SeoHead from '@core/components/SeoHead';
import { ToastProvider } from './shared/components/ui/Toast';
import Loader from './shared/components/ui/Loader';
import ErrorBoundary from './shared/components/ErrorBoundary';
import LenisScroll from './shared/components/LenisScroll';
import MaintenancePage from './shared/components/MaintenancePage';
import { useEffect, useState } from 'react';
import { socketService } from '@core/services/socket';

function App() {
    const [maintenanceConfig, setMaintenanceConfig] = useState(null);

    useEffect(() => {
        // Axios interceptor custom event
        const handleMaintenance = (e) => setMaintenanceConfig(e.detail);
        window.addEventListener('maintenance_mode', handleMaintenance);
        
        // Socket.IO event
        const socket = socketService.connect();
        
        const handleSocketMaintenance = (data) => {
            if (data?.enabled) {
                setMaintenanceConfig(data);
            } else {
                setMaintenanceConfig(null);
            }
        };

        if (socket) {
            socket.on('maintenance:status', handleSocketMaintenance);
        }

        return () => {
            window.removeEventListener('maintenance_mode', handleMaintenance);
            if (socket) socket.off('maintenance:status', handleSocketMaintenance);
        };
    }, []);

    const isAdminRoute = window.location.pathname.startsWith('/admin');

    if (maintenanceConfig && !isAdminRoute) {
        return <MaintenancePage config={maintenanceConfig} />;
    }

    return (
        <ErrorBoundary>
            <AuthProvider>
                <SettingsProvider>
                    <SeoHead />
                    <ToastProvider>
                        <Suspense fallback={<Loader fullScreen />}>
                            <SupportUnreadProvider>
                                <LenisScroll />
                                <AppRouter />
                            </SupportUnreadProvider>
                        </Suspense>
                    </ToastProvider>
                </SettingsProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;

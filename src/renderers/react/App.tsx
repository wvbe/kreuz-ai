import { appServicesContext } from "./AppServices";
import type { AppServices } from "./AppServices";
import { AppShell } from "./AppShell";
import { EngineProvider } from "./engine/EngineProvider";
import type { EngineHost } from "./engine/EngineHost";
import { ToastKind } from "./engine/ToastStore";
import { ErrorBoundary } from "./ui/ErrorBoundary";

/**
 * Root component of the React renderer: provides the host and the services, guards the tree with
 * an error boundary and renders the shell.
 *
 * @param props - The engine host and the services (the real WebGL canvas in the browser, a stub
 * in tests).
 * @returns The element tree.
 */
export function App(props: { host: EngineHost; services: AppServices }) {
  return (
    <EngineProvider host={props.host}>
      <appServicesContext.Provider value={props.services}>
        <ErrorBoundary
          onError={(error) =>
            props.host.toasts.push(ToastKind.Error, `Screen failed: ${error.message}`)
          }
        >
          <AppShell />
        </ErrorBoundary>
      </appServicesContext.Provider>
    </EngineProvider>
  );
}

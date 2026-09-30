import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './light.css';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:string}>{
  state={error:''};static getDerivedStateFromError(e:Error){return {error:e.message}}
  render(){return this.state.error?<div className="app-empty" role="alert"><h1>Falha ao iniciar o viewer</h1><p>{this.state.error}</p><button onClick={()=>location.reload()}>Recarregar</button></div>:this.props.children}
}
ReactDOM.createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);

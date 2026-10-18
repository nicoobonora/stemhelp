import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon } from './components';
export function NavigationDrawer({children,onClose}:{children:ReactNode;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useLayoutEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
  return <dialog id="navigation-drawer" ref={ref} className="navigation-drawer" aria-label="Navigazione" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target!==ref.current)return;const rect=ref.current!.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose();}}><button className="icon-button drawer-close" aria-label="Chiudi navigazione" onClick={onClose}><Icon name="close" size={17}/></button>{children}</dialog>;
}

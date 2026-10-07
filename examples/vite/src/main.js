import 'metaproject:components';

const card=document.querySelector('status-card');
document.querySelector('#change-status').addEventListener('click',()=>{
  card.message='Updated by the Vite host';
});

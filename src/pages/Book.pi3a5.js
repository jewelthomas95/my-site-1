/* The accommodation workspace is hosted in the Home-page HTML component. */
import wixLocationFrontend from 'wix-location-frontend';

$w.onReady(() => {
  wixLocationFrontend.to('/');
});

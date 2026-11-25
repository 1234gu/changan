import fleetSceneBackground from '../../../../assets/fleet-scene-panorama.webp';

export function SceneBackground() {
  return (
    <div className="fleet-scene__background" aria-hidden="true">
      <img
        className="fleet-scene__background-image"
        src={fleetSceneBackground}
        alt=""
        draggable={false}
      />
      <span className="fleet-scene__background-vignette" />
    </div>
  );
}

import parkingSceneBackground from '../../../../assets/fleet-parking-campus-v1.png';
import changanLogo from '../../../../assets/branding/changan-logo.png';

export function ParkingSceneBackground({
  imageSrc = parkingSceneBackground,
}: {
  imageSrc?: string;
}) {
  return (
    <div className="parking-scene__background" aria-hidden="true">
      <img className="parking-scene__background-image" src={imageSrc} alt="" draggable={false} />
      <span className="parking-scene__building-brand">
        <img src={changanLogo} alt="" draggable={false} />
        <span>
          <strong>长安汽车</strong>
          <small>CHANGAN</small>
        </span>
      </span>
      <span className="parking-scene__background-shade" />
    </div>
  );
}

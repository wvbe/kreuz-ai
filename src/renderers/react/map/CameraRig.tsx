import { useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import type { OrthographicCamera } from "three";
import { cameraPose } from "./cameraMath";
import type { CameraState } from "./cameraMath";

/**
 * Applies the camera state to the orthographic camera of the canvas: pose from `cameraPose`,
 * zoom in pixels per world unit. Renders nothing.
 *
 * @param props - The camera state.
 * @returns Nothing.
 */
export function CameraRig(props: { camera: CameraState }) {
  const camera = useThree((state) => state.camera) as OrthographicCamera;
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    const pose = cameraPose(props.camera);
    camera.position.set(...pose.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(...pose.target);
    camera.zoom = props.camera.zoom;
    camera.near = 0.1;
    camera.far = 1000;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, props.camera]);
  return null;
}

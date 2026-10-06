import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { Camera } from "three";
import { describe, expect, it } from "vitest";
import { cameraPose } from "./cameraMath";
import { CameraRig } from "./CameraRig";

describe("CameraRig", () => {
  it("places the orthographic camera from the camera state", async () => {
    const state = { centerX: 10, centerZ: 12, zoom: 33, rotation: 0.5 };
    const captured: { camera: Camera | null } = { camera: null };
    function Capture() {
      captured.camera = useThree((three) => three.camera);
      return null;
    }
    const renderer = await ReactThreeTestRenderer.create(
      <>
        <Capture />
        <CameraRig camera={state} />
      </>,
    );
    const pose = cameraPose(state);
    const camera = captured.camera as Camera & { zoom: number };
    expect(camera.position.x).toBeCloseTo(pose.position[0]);
    expect(camera.position.y).toBeCloseTo(pose.position[1]);
    expect(camera.position.z).toBeCloseTo(pose.position[2]);
    expect(camera.zoom).toBe(33);
    await renderer.unmount();
  });
});

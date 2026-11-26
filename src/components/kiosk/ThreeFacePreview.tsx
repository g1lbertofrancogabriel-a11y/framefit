import React, { useEffect, useRef } from 'react';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FacialScanResult, FrameItem } from '../../types/framefit';
import { LEFT_IRIS_CENTER, RIGHT_IRIS_CENTER } from '../../utils/faceAnalytics';

interface ThreeFacePreviewProps {
  scanResult: FacialScanResult;
  frame: FrameItem;
  className?: string;
}

// Extract consistent front-facing triangles from MediaPipe FACE_LANDMARKS_TESSELATION edge graph
function buildFaceTrianglesFromTesselation(
  landmarks: Array<{ x: number; y: number; z: number }>
): number[] {
  const adj = new Map<number, Set<number>>();
  const addEdge = (u: number, v: number) => {
    if (u >= landmarks.length || v >= landmarks.length) return;
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u)!.add(v);
    adj.get(v)!.add(u);
  };

  for (const conn of FaceLandmarker.FACE_LANDMARKS_TESSELATION) {
    addEdge(conn.start, conn.end);
  }

  const indices: number[] = [];
  const seen = new Set<string>();

  for (const [a, neighborsA] of adj.entries()) {
    for (const b of neighborsA) {
      if (b <= a) continue;
      const neighborsB = adj.get(b);
      if (!neighborsB) continue;
      for (const c of neighborsB) {
        if (c <= b || !neighborsA.has(c)) continue;
        const key = `${a}-${b}-${c}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Enforce front-facing winding (+Z normal toward viewer)
        const pa = landmarks[a];
        const pb = landmarks[b];
        const pc = landmarks[c];
        const ux = pb.x - pa.x;
        const uy = -(pb.y - pa.y);
        const vx = pc.x - pa.x;
        const vy = -(pc.y - pa.y);
        const crossZ = ux * vy - uy * vx;

        if (crossZ >= 0) {
          indices.push(a, b, c);
        } else {
          indices.push(a, c, b);
        }
      }
    }
  }
  return indices;
}

export const ThreeFacePreview: React.FC<ThreeFacePreviewProps> = ({
  scanResult,
  frame,
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = Math.max(240, container.clientWidth || 440);
    const height = Math.max(240, container.clientHeight || 440);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const glRendererStr = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    const isSoftwareGl =
      typeof glRendererStr === 'string' &&
      /swiftshader|llvmpipe|software/i.test(glRendererStr);

    const scene = new THREE.Scene();

    // Subtle studio lighting + RoomEnvironment PMREM
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 50);
    camera.position.set(0, -0.05, 5.2);
    camera.lookAt(0, -0.08, 0);

    const ambient = new THREE.AmbientLight(0xffffff, isSoftwareGl ? 0.85 : 0.65);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(2.4, 3.2, 4.2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd9efff, 0.6);
    fillLight.position.set(-3.0, 1.0, 3.0);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xeef6ff, 0.55);
    rimLight.position.set(0, 2.5, -3.5);
    scene.add(rimLight);

    // Master group for gentle side-to-side head rotation
    const replicaGroup = new THREE.Group();
    scene.add(replicaGroup);

    const disposables: Array<{ dispose: () => void }> = [pmrem, envTex];

    const lms = scanResult.capturedLandmarks;
    const aspect =
      (scanResult.capturedWidth || 1280) / Math.max(1, scanResult.capturedHeight || 720);

    // Compute scale so face height fits nicely (~2.15 world units tall)
    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    if (lms && lms.length >= 468) {
      for (const p of lms) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    } else {
      minX = 0.35;
      maxX = 0.65;
      minY = 0.2;
      maxY = 0.8;
    }

    const faceCx = (minX + maxX) / 2;
    const faceCy = (minY + maxY) / 2;
    const normFaceH = Math.max(0.1, maxY - minY);
    const scaleFactor = 2.05 / normFaceH;

    const toWorld = (p: { x: number; y: number; z: number }) =>
      new THREE.Vector3(
        (p.x - faceCx) * aspect * scaleFactor,
        -(p.y - faceCy) * scaleFactor + 0.14,
        -p.z * aspect * scaleFactor * 0.9
      );

    // Studio monochrome alabaster material matching Slide 15 bust aesthetic
    const studioBustMaterial = new THREE.MeshStandardMaterial({
      color: 0xe6eaf0,
      roughness: 0.66,
      metalness: 0.04,
    });
    disposables.push(studioBustMaterial);

    // Sculpted back cranium, neck & shoulders so silhouette rotates seamlessly in 3D
    const faceWidthWorld = (maxX - minX) * aspect * scaleFactor;
    const craniumGeo = new THREE.SphereGeometry(faceWidthWorld * 0.56, 32, 24);
    craniumGeo.scale(0.92, 1.18, 1.05);
    const craniumMesh = new THREE.Mesh(craniumGeo, studioBustMaterial);
    craniumMesh.position.set(0, 0.22, -faceWidthWorld * 0.42);
    replicaGroup.add(craniumMesh);
    disposables.push(craniumGeo);

    const neckGeo = new THREE.CylinderGeometry(
      faceWidthWorld * 0.31,
      faceWidthWorld * 0.37,
      1.0,
      24
    );
    const neckMesh = new THREE.Mesh(neckGeo, studioBustMaterial);
    neckMesh.position.set(0, -1.02, -0.28);
    replicaGroup.add(neckMesh);
    disposables.push(neckGeo);

    const shouldersGeo = new THREE.SphereGeometry(1.18, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.52);
    shouldersGeo.scale(1.18, 0.52, 0.62);
    const shouldersMesh = new THREE.Mesh(shouldersGeo, studioBustMaterial);
    shouldersMesh.position.set(0, -1.58, -0.26);
    replicaGroup.add(shouldersMesh);
    disposables.push(shouldersGeo);

    // Face Mask Mesh built from real MediaPipe 468+ 3D landmarks & monochrome photo texture
    let faceMeshMat: THREE.MeshStandardMaterial = studioBustMaterial;
    if (lms && lms.length >= 468) {
      const faceGeo = new THREE.BufferGeometry();
      const posArr = new Float32Array(lms.length * 3);
      const uvArr = new Float32Array(lms.length * 2);

      for (let i = 0; i < lms.length; i++) {
        const v = toWorld(lms[i]);
        posArr[i * 3] = v.x;
        posArr[i * 3 + 1] = v.y;
        posArr[i * 3 + 2] = v.z;
        uvArr[i * 2] = lms[i].x;
        uvArr[i * 2 + 1] = 1 - lms[i].y;
      }

      const triIndices = buildFaceTrianglesFromTesselation(lms);
      faceGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      faceGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      faceGeo.setIndex(triIndices);
      faceGeo.computeVertexNormals();
      disposables.push(faceGeo);

      if (scanResult.capturedPhotoDataUrl) {
        // Convert user's captured photo into soft monochrome studio portrait texture on canvas
        const photoCanvas = document.createElement('canvas');
        const photoTex = new THREE.CanvasTexture(photoCanvas);
        photoTex.colorSpace = THREE.SRGBColorSpace;
        disposables.push(photoTex);

        faceMeshMat = new THREE.MeshStandardMaterial({
          map: photoTex,
          color: 0xf4f7fb,
          roughness: 0.68,
          metalness: 0.03,
        });
        disposables.push(faceMeshMat);

        const userImg = new Image();
        userImg.onload = () => {
          photoCanvas.width = 512;
          photoCanvas.height = 512;
          const pCtx = photoCanvas.getContext('2d');
          if (pCtx) {
            pCtx.filter = 'grayscale(100%) brightness(112%) contrast(106%)';
            pCtx.drawImage(userImg, 0, 0, 512, 512);
            photoTex.needsUpdate = true;
          }
        };
        userImg.src = scanResult.capturedPhotoDataUrl;
      }

      const faceMesh = new THREE.Mesh(faceGeo, faceMeshMat);
      replicaGroup.add(faceMesh);
    }

    // Place Finalized Transparent-PNG Glasses on Eye/Iris & Nose-Bridge Landmarks
    const glassesGroup = new THREE.Group();
    replicaGroup.add(glassesGroup);

    const frameLoader = new THREE.TextureLoader();
    const frameTex = frameLoader.load(frame.imageUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const img = tex.image as { width?: number; height?: number } | undefined;
      const imgAspect = img && img.width && img.height ? img.width / img.height : 2.6;

      // Compute exact eye-to-eye & bridge 3D anchor from user's captured landmarks
      let bridgePos = new THREE.Vector3(0, 0.24, 0.34);
      let eyeTiltRad = 0;
      let glassesWidthWorld = faceWidthWorld * 0.92;

      if (lms && lms.length >= 478) {
        const leftIris = toWorld(lms[LEFT_IRIS_CENTER]);
        const rightIris = toWorld(lms[RIGHT_IRIS_CENTER]);
        const noseBridge = toWorld(lms[168]);
        const leftCheek = toWorld(lms[234]);
        const rightCheek = toWorld(lms[454]);

        const midEyes = new THREE.Vector3()
          .addVectors(leftIris, rightIris)
          .multiplyScalar(0.5);
        bridgePos = new THREE.Vector3(
          noseBridge.x * 0.65 + midEyes.x * 0.35,
          midEyes.y * 0.72 + noseBridge.y * 0.28,
          Math.max(leftIris.z, rightIris.z, noseBridge.z) + 0.085
        );
        eyeTiltRad = Math.atan2(rightIris.y - leftIris.y, rightIris.x - leftIris.x);

        const realFaceSpanWorld = leftCheek.distanceTo(rightCheek);
        const framePhysicalWidthMm =
          frame.lensWidthMm * 2 + frame.bridgeWidthMm + 16;
        const widthRatio = Math.max(
          0.78,
          Math.min(1.16, framePhysicalWidthMm / Math.max(105, scanResult.faceWidthMm))
        );
        glassesWidthWorld = realFaceSpanWorld * widthRatio;
      }

      const glassesHeightWorld = glassesWidthWorld / Math.max(1.2, imgAspect);

      // Slightly curved cylindrical front plane so lenses wrap naturally around eyes
      const frontGeo = new THREE.PlaneGeometry(glassesWidthWorld, glassesHeightWorld, 16, 1);
      const posAttr = frontGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const normX = vx / (glassesWidthWorld * 0.5);
        posAttr.setZ(i, -Math.pow(normX, 2) * 0.08);
      }
      frontGeo.computeVertexNormals();
      disposables.push(frontGeo);

      const frontMat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.03,
        depthWrite: false,
        roughness: 0.35,
        metalness: 0.25,
        side: THREE.DoubleSide,
      });
      disposables.push(frontMat);

      const frontMesh = new THREE.Mesh(frontGeo, frontMat);
      glassesGroup.add(frontMesh);

      // Subtle 3D temple arms extending backward toward ears
      const armLength = glassesWidthWorld * 0.68;
      const armGeo = new THREE.BoxGeometry(0.025, 0.032, armLength);
      const armMat = new THREE.MeshStandardMaterial({
        color: 0x2a2f36,
        roughness: 0.45,
        metalness: 0.35,
      });
      disposables.push(armGeo, armMat);

      const leftArm = new THREE.Mesh(armGeo, armMat);
      leftArm.position.set(
        -glassesWidthWorld * 0.47,
        glassesHeightWorld * 0.14,
        -armLength * 0.5 - 0.07
      );
      const rightArm = new THREE.Mesh(armGeo, armMat);
      rightArm.position.set(
        glassesWidthWorld * 0.47,
        glassesHeightWorld * 0.14,
        -armLength * 0.5 - 0.07
      );
      glassesGroup.add(leftArm, rightArm);

      glassesGroup.position.copy(bridgePos);
      glassesGroup.rotation.z = eyeTiltRad;
    });
    disposables.push(frameTex);

    // ResizeObserver for crisp container fitting
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(120, Math.floor(entry.contentRect.width));
      const h = Math.max(120, Math.floor(entry.contentRect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    let rafId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      // Gentle slow studio rotation so user sees 3D glasses fit from slight angles
      replicaGroup.rotation.y = Math.sin(elapsed * 0.72) * 0.26;
      replicaGroup.rotation.x = Math.sin(elapsed * 0.45) * 0.04;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      disposables.forEach((d) => {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [scanResult, frame]);

  return (
    <div
      ref={mountRef}
      className={`w-full h-full flex items-center justify-center ${className}`}
      aria-label="3D AR Replica Try-On Preview"
    />
  );
};

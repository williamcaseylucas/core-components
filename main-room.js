import { vueComponents } from 'https://williamcaseylucas.github.io/vue-apps/dist/hubs.js';

/**
 * Modified from https://github.com/mozilla/hubs/blob/master/src/components/fader.js
 * to include adjustable duration and converted from component to system
 */

AFRAME.registerSystem('fader-plus', {
  schema: {
    direction: { type: 'string', default: 'none' }, // "in", "out", or "none"
    duration: { type: 'number', default: 200 }, // Transition duration in milliseconds
    color: { type: 'color', default: 'white' },
  },

  init() {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({
        color: this.data.color,
        side: THREE.BackSide,
        opacity: 0,
        transparent: true,
        fog: false,
      })
    );
    mesh.scale.x = mesh.scale.y = 1;
    mesh.scale.z = 0.15;
    mesh.matrixNeedsUpdate = true;
    mesh.renderOrder = 1; // render after other transparent stuff
    this.el.camera.add(mesh);
    this.mesh = mesh;
  },

  fadeOut() {
    return this.beginTransition('out')
  },

  fadeIn() {
    return this.beginTransition('in')
  },

  async beginTransition(direction) {
    if (this._resolveFinish) {
      throw new Error('Cannot fade while a fade is happening.')
    }

    this.el.setAttribute('fader-plus', { direction });

    return new Promise((res) => {
      if (this.mesh.material.opacity === (direction == 'in' ? 0 : 1)) {
        res();
      } else {
        this._resolveFinish = res;
      }
    })
  },

  tick(t, dt) {
    const mat = this.mesh.material;
    this.mesh.visible = this.data.direction === 'out' || mat.opacity !== 0;
    if (!this.mesh.visible) return

    if (this.data.direction === 'in') {
      mat.opacity = Math.max(0, mat.opacity - (1.0 / this.data.duration) * Math.min(dt, 50));
    } else if (this.data.direction === 'out') {
      mat.opacity = Math.min(1, mat.opacity + (1.0 / this.data.duration) * Math.min(dt, 50));
    }

    if (mat.opacity === 0 || mat.opacity === 1) {
      if (this.data.direction !== 'none') {
        if (this._resolveFinish) {
          this._resolveFinish();
          this._resolveFinish = null;
        }
      }

      this.el.setAttribute('fader-plus', { direction: 'none' });
    }
  },
});

const worldCamera$1 = new THREE.Vector3();
const worldSelf$1 = new THREE.Vector3();

AFRAME.registerComponent('proximity-events', {
  schema: {
    radius: { type: 'number', default: 1 },
    fuzz: { type: 'number', default: 0.1 },
    Yoffset: { type: 'number', default: 0 },
  },
  init() {
    this.inZone = false;
    this.camera = this.el.sceneEl.camera;
  },
  tick() {
    this.camera.getWorldPosition(worldCamera$1);
    this.el.object3D.getWorldPosition(worldSelf$1);
    const wasInzone = this.inZone;

    worldCamera$1.y -= this.data.Yoffset;
    var dist = worldCamera$1.distanceTo(worldSelf$1);
    var threshold = this.data.radius + (this.inZone ? this.data.fuzz  : 0);
    this.inZone = dist < threshold;
    if (this.inZone && !wasInzone) this.el.emit('proximityenter');
    if (!this.inZone && wasInzone) this.el.emit('proximityleave');
  },
});

// Provides a global registry of running components
// copied from hubs source

function registerComponentInstance(component, name) {
    window.APP.componentRegistry = window.APP.componentRegistry || {};
    window.APP.componentRegistry[name] = window.APP.componentRegistry[name] || [];
    window.APP.componentRegistry[name].push(component);
}

function deregisterComponentInstance(component, name) {
    if (!window.APP.componentRegistry || !window.APP.componentRegistry[name]) return;
    window.APP.componentRegistry[name].splice(window.APP.componentRegistry[name].indexOf(component), 1);
}

function findAncestorWithComponent(entity, componentName) {
    while (entity && !(entity.components && entity.components[componentName])) {
        entity = entity.parentNode;
    }
    return entity;
}

/**
 * Description
 * ===========
 * break the room into quadrants of a certain size, and hide the contents of areas that have
 * nobody in them.  Media will be paused in those areas too.
 * 
 * Include a way for the portal component to turn on elements in the region of the portal before
 * it captures a cubemap
 */

 // arbitrarily choose 1000000 as the number of computed zones in  x and y
let MAX_ZONES = 1000000;
let regionTag = function(size, obj3d) {
    let pos = obj3d.position;
    let xp = Math.floor(pos.x / size) + MAX_ZONES/2;
    let zp = Math.floor(pos.z / size) + MAX_ZONES/2;
    return MAX_ZONES * xp + zp
};

let regionsInUse = [];

/**
 * Find the closest ancestor (including the passed in entity) that has an `object-region-follower` component,
 * and return that component
 */
function getRegionFollower(entity) {
    let curEntity = entity;
  
    while(curEntity && curEntity.components && !curEntity.components["object-region-follower"]) {
        curEntity = curEntity.parentNode;
    }
  
    if (!curEntity || !curEntity.components || !curEntity.components["object-region-follower"]) {
        return;
    }
    
    return curEntity.components["object-region-follower"]
}
  
function addToRegion(region) {
    regionsInUse[region] ? regionsInUse[region]++ : regionsInUse[region] = 1;
    console.log("Avatars in region " + region + ": " + regionsInUse[region]);
    if (regionsInUse[region] == 1) {
        showHideObjectsInRegion(region, true);
    } else {
        console.log("already another avatar in this region, no change");
    }
}

function subtractFromRegion(region) {
    if (regionsInUse[region]) {regionsInUse[region]--; }
    console.log("Avatars left region " + region + ": " + regionsInUse[region]);

    if (regionsInUse[region] == 0) {
        showHideObjectsInRegion(region, false);
    } else {
        console.log("still another avatar in this region, no change");
    }
}

function showRegionForObject(element) {
    let follower = getRegionFollower(element);
    if (!follower) { return }

    console.log("showing objects near " + follower.el.className);

    addToRegion(follower.region);
}

function hiderRegionForObject(element) {
    let follower = getRegionFollower(element);
    if (!follower) { return }

    console.log("hiding objects near " + follower.el.className);

    subtractFromRegion(follower.region);
}

function showHideObjects() {
    if (!window.APP || !window.APP.componentRegistry)
      return null;

    console.log ("showing/hiding all objects");
    const objects = window.APP.componentRegistry["object-region-follower"] || [];
  
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      
      let visible = regionsInUse[obj.region] ? true: false;
        
      if (obj.el.object3D.visible == visible) { continue }

      console.log ((visible ? "showing " : "hiding ") + obj.el.className);
      obj.showHide(visible);
    }
  
    return null;
}

function showHideObjectsInRegion(region, visible) {
    if (!window.APP || !window.APP.componentRegistry)
      return null;

    console.log ((visible ? "showing" : "hiding") + " all objects in region " + region);
    const objects = window.APP.componentRegistry["object-region-follower"] || [];
  
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      
      if (obj.region == region) {
        console.log ((visible ? "showing " : " hiding") + obj.el.className);
        obj.showHide(visible);
      }
    }
  
    return null;
}
  
AFRAME.registerComponent('avatar-region-follower', {
    schema: {
        size: { default: 10 }
    },
    init: function () {
        this.region = regionTag(this.data.size, this.el.object3D);
        console.log("Avatar: region ", this.region);
        addToRegion(this.region);

        registerComponentInstance(this, "avatar-region-follower");
    },
    remove: function() {
        deregisterComponentInstance(this, "avatar-region-follower");
        subtractFromRegion(this.region);
    },

    tick: function () {
        let newRegion = regionTag(this.data.size, this.el.object3D);
        if (newRegion != this.region) {
            subtractFromRegion(this.region);
            addToRegion(newRegion);
            this.region = newRegion;
        }
    },
});

AFRAME.registerComponent('object-region-follower', {
    schema: {
        size: { default: 10 },
        dynamic: { default: true }
    },
    init: function () {
        this.region = regionTag(this.data.size, this.el.object3D);

        this.showHide = this.showHide.bind(this);
        if (this.el.components["media-video"]) {
            this.wasPaused = this.el.components["media-video"].data.videoPaused;
        }
        registerComponentInstance(this, "object-region-follower");
    },

    remove: function() {
        deregisterComponentInstance(this, "object-region-follower");
    },

    tick: function () {
        // objects in the environment scene don't move
        if (!this.data.dynamic) { return }

        this.region = regionTag(this.data.size, this.el.object3D);

        let visible = regionsInUse[this.region] ? true: false;
        
        if (this.el.object3D.visible == visible) { return }

        // handle show/hiding the objects
        this.showHide(visible);
    },

    showHide: function (visible) {
        // handle show/hiding the objects
        this.el.object3D.visible = visible;

        /// check for media-video component on parent to see if we're a video.  Also same for audio
        if (this.el.components["media-video"]) {
            if (visible) {
                if (this.wasPaused != this.el.components["media-video"].data.videoPaused) {
                    this.el.components["media-video"].togglePlaying();
                }
            } else {
                this.wasPaused = this.el.components["media-video"].data.videoPaused;
                if (!this.wasPaused) {
                    this.el.components["media-video"].togglePlaying();
                }
            }
        }
    }
});

AFRAME.registerComponent('region-hider', {
    schema: {
        // name must follow the pattern "*_componentName"
        size: { default: 10 }
    },
    init: function () {
        // If there is a parent with "nav-mesh-helper", this is in the scene.  
        // If not, it's in an object we dropped on the window, which we don't support
        if (!findAncestorWithComponent(this.el, "nav-mesh-helper")) {
            console.warn("region-hider component must be in the environment scene glb.");
            this.size = 0;
            return;
        }
        
        if(this.data.size == 0) {
            this.data.size = 10;
            this.size = this.parseNodeName(this.data.size);
        }

        // this.newScene = this.newScene.bind(this)
        // this.el.sceneEl.addEventListener("environment-scene-loaded", this.newScene)
        // const environmentScene = document.querySelector("#environment-scene");
        // this.addSceneElement = this.addSceneElement.bind(this)
        // this.removeSceneElement = this.removeSceneElement.bind(this)
        // environmentScene.addEventListener("child-attached", this.addSceneElement)
        // environmentScene.addEventListener("child-detached", this.removeSceneElement)

        // we want to notice when new things get added to the room.  This will happen for
        // objects dropped in the room, or for new remote avatars, at least
        // this.addRootElement = this.addRootElement.bind(this)
        // this.removeRootElement = this.removeRootElement.bind(this)
        // this.el.sceneEl.addEventListener("child-attached", this.addRootElement)
        // this.el.sceneEl.addEventListener("child-detached", this.removeRootElement)

        // want to see if there are pinned objects that were loaded from hubs
        let roomObjects = document.getElementsByClassName("RoomObjects");
        this.roomObjects = roomObjects.length > 0 ? roomObjects[0] : null;

        // get avatars
        const avatars = this.el.sceneEl.querySelectorAll("[player-info]");
        avatars.forEach((avatar) => {
            avatar.setAttribute("avatar-region-follower", { size: this.size });
        });

        // walk objects in the root (things that have been dropped on the scene)
        // - drawings have class="drawing", networked-drawing
        // Not going to do drawings right now.

        // pinned media live under a node with class="RoomObjects"
        var nodes = this.el.sceneEl.querySelectorAll(".RoomObjects > [media-loader]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });

        // - camera has camera-tool        
        // - image from camera, or dropped, has media-loader, media-image, listed-media
        // - glb has media-loader, gltf-model-plus, listed-media
        // - video has media-loader, media-video, listed-media
        //
        //  so, get all camera-tools, and media-loader objects at the top level of the scene
        nodes = this.el.sceneEl.querySelectorAll("[camera-tool], a-scene > [media-loader]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });

        nodes = this.el.sceneEl.querySelectorAll("[camera-tool]");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });

        // walk the objects in the environment scene.  Must wait for scene to finish loading
        this.sceneLoaded = this.sceneLoaded.bind(this);
        this.el.sceneEl.addEventListener("environment-scene-loaded", this.sceneLoaded);

    },

    isAncestor: function (root, entity) {
        while (entity && !(entity == root)) {
          entity = entity.parentNode;
        }
        return (entity == root);
    },
    
    // Things we don't want to hide:
    // - [waypoint]
    // - parent of something with [navmesh] as a child (this is the navigation stuff
    // - this.el.parentEl.parentEl
    // - [skybox]
    // - [directional-light]
    // - [ambient-light]
    // - [hemisphere-light]
    // - #CombinedMesh
    // - #scene-preview-camera or [scene-preview-camera]
    //
    // we will do
    // - [media-loader]
    // - [spot-light]
    // - [point-light]
    sceneLoaded: function () {
        let nodes = document.getElementById("environment-scene").children[0].children[0];
        //var nodes = this.el.parentEl.parentEl.parentEl.childNodes;
        for (let i=0; i < nodes.length; i++) {
            let node = nodes[i];
            //if (node == this.el.parentEl.parentEl) {continue}
            if (this.isAncestor(node, this.el)) {continue}

            let cl = node.className;
            if (cl === "CombinedMesh" || cl === "scene-preview-camera") {continue}

            let c = node.components;
            if (c["waypoint"] || c["skybox"] || c["directional-light"] || c["ambient-light"] || c["hemisphere-light"]) {continue}

            let ch = node.children;
            var navmesh = false;
            for (let j=0; j < ch.length; j++) {
                if (ch[j].components["navmesh"]) {
                    navmesh = true;
                    break;
                }
            }
            if (navmesh) {continue}
            
            node.setAttribute("object-region-follower", { size: this.size, dynamic: false });
        }

        // all objects and avatar should be set up, so lets make sure all objects are correctly shown
        showHideObjects();
    },

    update: function () {
        if (this.data.size === this.size) return

        if (this.data.size == 0) {
            this.data.size = 10;
            this.size = this.parseNodeName(this.data.size);
        }
    },

    remove: function () {
        this.el.sceneEl.removeEventListener("environment-scene-loaded", this.sceneLoaded);
    },

    // per frame stuff
    tick: function (time) {
        // size == 0 is used to signal "do nothing"
        if (this.size == 0) {return}

        // see if there are new avatars
        var nodes = this.el.sceneEl.querySelectorAll("[player-info]:not([avatar-region-follower])");
        nodes.forEach((avatar) => {
            avatar.setAttribute("avatar-region-follower", { size: this.size });
        });

        //  see if there are new camera-tools or media-loader objects at the top level of the scene
        nodes = this.el.sceneEl.querySelectorAll("[camera-tool]:not([object-region-follower]), a-scene > [media-loader]:not([object-region-follower])");
        nodes.forEach((node) => {
            node.setAttribute("object-region-follower", { size: this.size });
        });
    },
  
    // newScene: function(model) {
    //     console.log("environment scene loaded: ", model)
    // },

    // addRootElement: function({ detail: { el } }) {
    //     console.log("entity added to root: ", el)
    // },

    // removeRootElement: function({ detail: { el } }) {
    //     console.log("entity removed from root: ", el)
    // },

    // addSceneElement: function({ detail: { el } }) {
    //     console.log("entity added to environment scene: ", el)
    // },

    // removeSceneElement: function({ detail: { el } }) {
    //     console.log("entity removed from environment scene: ", el)
    // },  
    
    parseNodeName: function (size) {
        // nodes should be named anything at the beginning with 
        //  "size" (an integer number)
        // at the very end.  This will set the hidder component to 
        // use that size in meters for the quadrants
        this.nodeName = this.el.parentEl.parentEl.className;

        const params = this.nodeName.match(/_([0-9]*)$/);

        // if pattern matches, we will have length of 2, first match is the dir,
        // second is the componentName name or number
        if (!params || params.length < 2) {
            console.warn("region-hider componentName not formatted correctly: ", this.nodeName);
            return size
        } else {
            let nodeSize = parseInt(params[1]);
            if (!nodeSize) {
                return size
            } else {
                return nodeSize
            }
        }
    }
});

let DefaultHooks = {
    vertexHooks: {
        uniforms: 'insertbefore:#include <common>\n',
        functions: 'insertafter:#include <clipping_planes_pars_vertex>\n',
        preTransform: 'insertafter:#include <begin_vertex>\n',
        postTransform: 'insertafter:#include <project_vertex>\n',
        preNormal: 'insertafter:#include <beginnormal_vertex>\n'
    },
    fragmentHooks: {
        uniforms: 'insertbefore:#include <common>\n',
        functions: 'insertafter:#include <clipping_planes_pars_fragment>\n',
        preFragColor: 'insertbefore:gl_FragColor = vec4( outgoingLight, diffuseColor.a );\n',
        postFragColor: 'insertafter:gl_FragColor = vec4( outgoingLight, diffuseColor.a );\n',
        postMap: 'insertafter:#include <map_fragment>\n',
        replaceMap: 'replace:#include <map_fragment>\n'
    }
};

// based on https://github.com/jamieowen/three-material-modifier
const modifySource = (source, hookDefs, hooks) => {
    let match;
    for (let key in hookDefs) {
        if (hooks[key]) {
            match = /insert(before):(.*)|insert(after):(.*)|(replace):(.*)/.exec(hookDefs[key]);
            if (match) {
                if (match[1]) { // before
                    source = source.replace(match[2], hooks[key] + '\n' + match[2]);
                }
                else if (match[3]) { // after
                    source = source.replace(match[4], match[4] + '\n' + hooks[key]);
                }
                else if (match[5]) { // replace
                    source = source.replace(match[6], hooks[key]);
                }
            }
        }
    }
    return source;
};
// copied from three.renderers.shaders.UniformUtils.js
function cloneUniforms(src) {
    var dst = {};
    for (var u in src) {
        dst[u] = {};
        for (var p in src[u]) {
            var property = src[u][p];
            if (property && (property.isColor ||
                property.isMatrix3 || property.isMatrix4 ||
                property.isVector2 || property.isVector3 || property.isVector4 ||
                property.isTexture)) {
                dst[u][p] = property.clone();
            }
            else if (Array.isArray(property)) {
                dst[u][p] = property.slice();
            }
            else {
                dst[u][p] = property;
            }
        }
    }
    return dst;
}
let classMap = {
    MeshStandardMaterial: "standard",
    MeshBasicMaterial: "basic",
    MeshLambertMaterial: "lambert",
    MeshPhongMaterial: "phong",
    MeshDepthMaterial: "depth",
    standard: "standard",
    basic: "basic",
    lambert: "lambert",
    phong: "phong",
    depth: "depth"
};
let shaderMap;
const getShaderDef = (classOrString) => {
    if (!shaderMap) {
        let classes = {
            standard: THREE.MeshStandardMaterial,
            basic: THREE.MeshBasicMaterial,
            lambert: THREE.MeshLambertMaterial,
            phong: THREE.MeshPhongMaterial,
            depth: THREE.MeshDepthMaterial
        };
        shaderMap = {};
        for (let key in classes) {
            shaderMap[key] = {
                ShaderClass: classes[key],
                ShaderLib: THREE.ShaderLib[key],
                Key: key,
                Count: 0,
                ModifiedName: function () {
                    return `ModifiedMesh${this.Key[0].toUpperCase() + this.Key.slice(1)}Material_${++this.Count}`;
                },
                TypeCheck: `isMesh${key[0].toUpperCase() + key.slice(1)}Material`
            };
        }
    }
    let shaderDef;
    if (typeof classOrString === 'function') {
        for (let key in shaderMap) {
            if (shaderMap[key].ShaderClass === classOrString) {
                shaderDef = shaderMap[key];
                break;
            }
        }
    }
    else if (typeof classOrString === 'string') {
        let mappedClassOrString = classMap[classOrString];
        shaderDef = shaderMap[mappedClassOrString || classOrString];
    }
    if (!shaderDef) {
        throw new Error('No Shader found to modify...');
    }
    return shaderDef;
};
/**
 * The main Material Modofier
 */
class MaterialModifier {
    constructor(vertexHookDefs, fragmentHookDefs) {
        this._vertexHooks = {};
        this._fragmentHooks = {};
        if (vertexHookDefs) {
            this.defineVertexHooks(vertexHookDefs);
        }
        if (fragmentHookDefs) {
            this.defineFragmentHooks(fragmentHookDefs);
        }
    }
    modify(shader, opts) {
        let def = getShaderDef(shader);
        let vertexShader = modifySource(def.ShaderLib.vertexShader, this._vertexHooks, opts.vertexShader || {});
        let fragmentShader = modifySource(def.ShaderLib.fragmentShader, this._fragmentHooks, opts.fragmentShader || {});
        let uniforms = Object.assign({}, def.ShaderLib.uniforms, opts.uniforms || {});
        return { vertexShader, fragmentShader, uniforms };
    }
    extend(shader, opts) {
        let def = getShaderDef(shader); // ADJUST THIS SHADER DEF - ONLY DEFINE ONCE - AND STORE A USE COUNT ON EXTENDED VERSIONS.
        let vertexShader = modifySource(def.ShaderLib.vertexShader, this._vertexHooks, opts.vertexShader || {});
        let fragmentShader = modifySource(def.ShaderLib.fragmentShader, this._fragmentHooks, opts.fragmentShader || {});
        let uniforms = Object.assign({}, def.ShaderLib.uniforms, opts.uniforms || {});
        let ClassName = opts.className || def.ModifiedName();
        let extendMaterial = new Function('BaseClass', 'uniforms', 'vertexShader', 'fragmentShader', 'cloneUniforms', `

            let cls = class ${ClassName} extends BaseClass {
                constructor( params ){
                    super(params)
    
                    this.uniforms = cloneUniforms( uniforms );
    
                    this.vertexShader = vertexShader;
                    this.fragmentShader = fragmentShader;
                    this.type = '${ClassName}';
    
                    this.setValues( params );
                }
    
                copy( source ){
    
                    super.copy(source );
    
                    this.uniforms = Object.assign( {}, source.uniforms );
                    this.vertexShader = vertexShader;
                    this.fragmentShader = fragmentShader;
                    this.type = '${ClassName}';
    
                    return this;
    
                }
    
            }
            // var cls = function ${ClassName}( params ){

            //     //BaseClass.prototype.constructor.call( this, params );

            //     this.uniforms = cloneUniforms( uniforms );

            //     this.vertexShader = vertexShader;
            //     this.fragmentShader = fragmentShader;
            //     this.type = '${ClassName}';

            //     this.setValues( params );

            // }

            // cls.prototype = Object.create( BaseClass.prototype );
            // cls.prototype.constructor = cls;
            // cls.prototype.${def.TypeCheck} = true;

            // cls.prototype.copy = function( source ){

            //     BaseClass.prototype.copy.call( this, source );

            //     this.uniforms = Object.assign( {}, source.uniforms );
            //     this.vertexShader = vertexShader;
            //     this.fragmentShader = fragmentShader;
            //     this.type = '${ClassName}';

            //     return this;

            // }

            return cls;

        `);
        if (opts.postModifyVertexShader) {
            vertexShader = opts.postModifyVertexShader(vertexShader);
        }
        if (opts.postModifyFragmentShader) {
            fragmentShader = opts.postModifyFragmentShader(fragmentShader);
        }
        return extendMaterial(def.ShaderClass, uniforms, vertexShader, fragmentShader, cloneUniforms);
    }
    defineVertexHooks(defs) {
        for (let key in defs) {
            this._vertexHooks[key] = defs[key];
        }
    }
    defineFragmentHooks(defs) {
        for (let key in defs) {
            this._fragmentHooks[key] = defs[key];
        }
    }
}
let defaultMaterialModifier = new MaterialModifier(DefaultHooks.vertexHooks, DefaultHooks.fragmentHooks);

var shaderToyMain = /* glsl */ `
        // above here, the texture lookup will be done, which we
        // can disable by removing the map from the material
        // but if we leave it, we can also choose the blend the texture
        // with our shader created color, or use it in the shader or
        // whatever
        //
        // vec4 texelColor = texture2D( map, vUv );
        // texelColor = mapTexelToLinear( texelColor );
        
        vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); //mod(vUv.xy * texRepeat.xy + texOffset.xy, vec2(1.0,1.0));

        if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
        if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
        if (texFlipY > 0) { uv.y = 1.0 - uv.y;}
        uv.x = clamp(uv.x, 0.0, 1.0);
        uv.y = clamp(uv.y, 0.0, 1.0);
        
        vec4 shaderColor;
        mainImage(shaderColor, uv.xy * iResolution.xy);
        shaderColor = mapTexelToLinear( shaderColor );

        diffuseColor *= shaderColor;
`;

var shaderToyUniformObj = {
    iTime: { value: 0.0 },
    iResolution: { value: new THREE.Vector3(512, 512, 1) },
    texRepeat: { value: new THREE.Vector2(1, 1) },
    texOffset: { value: new THREE.Vector2(0, 0) },
    texFlipY: { value: 0 }
};

var shaderToyUniform_paras = /* glsl */ `
uniform vec3 iResolution;
uniform float iTime;
uniform vec2 texRepeat;
uniform vec2 texOffset;
uniform int texFlipY; 
  `;

var bayerImage = "https://williamcaseylucas.github.io/core-components/a448e34b8136fae5.png";

// simple shader taken from https://threejsfundamentals.org/threejs/lessons/threejs-shadertoy.html
const glsl$f = String.raw;
const uniforms$6 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$9 = new THREE.TextureLoader();
var bayerTex;
loader$9.load(bayerImage, (bayer) => {
    bayer.minFilter = THREE.NearestFilter;
    bayer.magFilter = THREE.NearestFilter;
    bayer.wrapS = THREE.RepeatWrapping;
    bayer.wrapT = THREE.RepeatWrapping;
    bayerTex = bayer;
});
let BleepyBlocksShader = {
    uniforms: uniforms$6,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$f `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$f `
      // By Daedelus: https://www.shadertoy.com/user/Daedelus
      // license: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
      #define TIMESCALE 0.25 
      #define TILES 8
      #define COLOR 0.7, 1.6, 2.8

      void mainImage( out vec4 fragColor, in vec2 fragCoord )
      {
        vec2 uv = fragCoord.xy / iResolution.xy;
        uv.x *= iResolution.x / iResolution.y;
        
        vec4 noise = texture2D(iChannel0, floor(uv * float(TILES)) / float(TILES));
        float p = 1.0 - mod(noise.r + noise.g + noise.b + iTime * float(TIMESCALE), 1.0);
        p = min(max(p * 3.0 - 1.8, 0.1), 2.0);
        
        vec2 r = mod(uv * float(TILES), 1.0);
        r = vec2(pow(r.x - 0.5, 2.0), pow(r.y - 0.5, 2.0));
        p *= 1.0 - pow(min(1.0, 12.0 * dot(r, r)), 2.0);
        
        fragColor = vec4(COLOR, 1.0) * p;
      }
      `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = bayerTex;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = time * 0.001;
        material.uniforms.iChannel0.value = bayerTex;
    }
};

// simple shader taken from https://threejsfundamentals.org/threejs/lessons/threejs-shadertoy.html
const glsl$e = String.raw;
let NoiseShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$e `
        #define nPI 3.1415926535897932

        mat2 n_rotate2d(float angle){
                return mat2(cos(angle),-sin(angle),
                            sin(angle), cos(angle));
        }
        
        float n_stripe(float number) {
                float mod = mod(number, 2.0);
                //return step(0.5, mod)*step(1.5, mod);
                //return mod-1.0;
                return min(1.0, (smoothstep(0.0, 0.5, mod) - smoothstep(0.5, 1.0, mod))*1.0);
        }
        
        void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
                vec2 u_resolution = iResolution.xy;
                float u_time = iTime;
                vec3 color;
                vec2 st = fragCoord.xy;
                st += 2000.0 + 998000.0*step(1.75, 1.0-sin(u_time/8.0));
                st += u_time/2000.0;
                float m = (1.0+9.0*step(1.0, 1.0-sin(u_time/8.0)))/(1.0+9.0*step(1.0, 1.0-sin(u_time/16.0)));
                vec2 st1 = st * (400.0 + 1200.0*step(1.75, 1.0+sin(u_time)) - 300.0*step(1.5, 1.0+sin(u_time/3.0)));
                st = n_rotate2d(sin(st1.x)*sin(st1.y)/(m*100.0+u_time/100.0)) * st;
                vec2 st2 = st * (100.0 + 1900.0*step(1.75, 1.0-sin(u_time/2.0)));
                st = n_rotate2d(cos(st2.x)*cos(st2.y)/(m*100.0+u_time/100.0)) * st;
                st = n_rotate2d(0.5*nPI+(nPI*0.5*step( 1.0,1.0+ sin(u_time/1.0)))
                              +(nPI*0.1*step( 1.0,1.0+ cos(u_time/2.0)))+u_time*0.0001) * st;
                st *= 10.0;
                st /= u_resolution;
                color = vec3(n_stripe(st.x*u_resolution.x/10.0+u_time/10.0));
                fragColor = vec4(color, 1.0);
        }
            `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = time * 0.001;
    }
};

// from https://www.shadertoy.com/view/XdsBDB
const glsl$d = String.raw;
let LiquidMarbleShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$d `
      //// COLORS ////

      const vec3 ORANGE = vec3(1.0, 0.6, 0.2);
      const vec3 PINK   = vec3(0.7, 0.1, 0.4); 
      const vec3 BLUE   = vec3(0.0, 0.2, 0.9); 
      const vec3 BLACK  = vec3(0.0, 0.0, 0.2);
      
      ///// NOISE /////
      
      float hash( float n ) {
          //return fract(sin(n)*43758.5453123);   
          return fract(sin(n)*75728.5453123); 
      }
      
      
      float noise( in vec2 x ) {
          vec2 p = floor(x);
          vec2 f = fract(x);
          f = f*f*(3.0-2.0*f);
          float n = p.x + p.y*57.0;
          return mix(mix( hash(n + 0.0), hash(n + 1.0), f.x), mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y);
      }
      
      ////// FBM ////// 
      
      mat2 m = mat2( 0.6, 0.6, -0.6, 0.8);
      float fbm(vec2 p){
       
          float f = 0.0;
          f += 0.5000 * noise(p); p *= m * 2.02;
          f += 0.2500 * noise(p); p *= m * 2.03;
          f += 0.1250 * noise(p); p *= m * 2.01;
          f += 0.0625 * noise(p); p *= m * 2.04;
          f /= 0.9375;
          return f;
      }
      
      
      void mainImage(out vec4 fragColor, in vec2 fragCoord){
          
          // pixel ratio
          
          vec2 uv = fragCoord.xy / iResolution.xy ;  
          vec2 p = - 1. + 2. * uv;
          p.x *= iResolution.x / iResolution.y;
           
          // domains
          
          float r = sqrt(dot(p,p)); 
          float a = cos(p.y * p.x);  
                 
          // distortion
          
          float f = fbm( 5.0 * p);
          a += fbm(vec2(1.9 - p.x, 0.9 * iTime + p.y));
          a += fbm(0.4 * p);
          r += fbm(2.9 * p);
             
          // colorize
          
          vec3 col = BLUE;
          
          float ff = 1.0 - smoothstep(-0.4, 1.1, noise(vec2(0.5 * a, 3.3 * a)) );        
          col =  mix( col, ORANGE, ff);
             
          ff = 1.0 - smoothstep(.0, 2.8, r );
          col +=  mix( col, BLACK,  ff);
          
          ff -= 1.0 - smoothstep(0.3, 0.5, fbm(vec2(1.0, 40.0 * a)) ); 
          col =  mix( col, PINK,  ff);  
            
          ff = 1.0 - smoothstep(2., 2.9, a * 1.5 ); 
          col =  mix( col, BLACK,  ff);  
                                                 
          fragColor = vec4(col, 1.);
      }
      `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: new THREE.Vector2(mat.map.offset.x + Math.random(), mat.map.offset.x + Math.random()) };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
    }
};

var smallNoise$1 = "https://williamcaseylucas.github.io/core-components/cecefb50e408d105.png";

// simple shader taken from https://www.shadertoy.com/view/MslGWN
const glsl$c = String.raw;
const uniforms$5 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$8 = new THREE.TextureLoader();
var noiseTex$3;
loader$8.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$3 = noise;
});
let GalaxyShader = {
    uniforms: uniforms$5,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$c `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$c `
        //CBS
        //Parallax scrolling fractal galaxy.
        //Inspired by JoshP's Simplicity shader: https://www.shadertoy.com/view/lslGWr
        
        // http://www.fractalforums.com/new-theories-and-research/very-simple-formula-for-fractal-patterns/
        float field(in vec3 p,float s) {
            float strength = 7. + .03 * log(1.e-6 + fract(sin(iTime) * 4373.11));
            float accum = s/4.;
            float prev = 0.;
            float tw = 0.;
            for (int i = 0; i < 26; ++i) {
                float mag = dot(p, p);
                p = abs(p) / mag + vec3(-.5, -.4, -1.5);
                float w = exp(-float(i) / 7.);
                accum += w * exp(-strength * pow(abs(mag - prev), 2.2));
                tw += w;
                prev = mag;
            }
            return max(0., 5. * accum / tw - .7);
        }
        
        // Less iterations for second layer
        float field2(in vec3 p, float s) {
            float strength = 7. + .03 * log(1.e-6 + fract(sin(iTime) * 4373.11));
            float accum = s/4.;
            float prev = 0.;
            float tw = 0.;
            for (int i = 0; i < 18; ++i) {
                float mag = dot(p, p);
                p = abs(p) / mag + vec3(-.5, -.4, -1.5);
                float w = exp(-float(i) / 7.);
                accum += w * exp(-strength * pow(abs(mag - prev), 2.2));
                tw += w;
                prev = mag;
            }
            return max(0., 5. * accum / tw - .7);
        }
        
        vec3 nrand3( vec2 co )
        {
            vec3 a = fract( cos( co.x*8.3e-3 + co.y )*vec3(1.3e5, 4.7e5, 2.9e5) );
            vec3 b = fract( sin( co.x*0.3e-3 + co.y )*vec3(8.1e5, 1.0e5, 0.1e5) );
            vec3 c = mix(a, b, 0.5);
            return c;
        }
        
        
        void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
            vec2 uv = 2. * fragCoord.xy / iResolution.xy - 1.;
            vec2 uvs = uv * iResolution.xy / max(iResolution.x, iResolution.y);
            vec3 p = vec3(uvs / 4., 0) + vec3(1., -1.3, 0.);
            p += .2 * vec3(sin(iTime / 16.), sin(iTime / 12.),  sin(iTime / 128.));
            
            float freqs[4];
            //Sound
            freqs[0] = texture( iChannel0, vec2( 0.01, 0.25 ) ).x;
            freqs[1] = texture( iChannel0, vec2( 0.07, 0.25 ) ).x;
            freqs[2] = texture( iChannel0, vec2( 0.15, 0.25 ) ).x;
            freqs[3] = texture( iChannel0, vec2( 0.30, 0.25 ) ).x;
        
            float t = field(p,freqs[2]);
            float v = (1. - exp((abs(uv.x) - 1.) * 6.)) * (1. - exp((abs(uv.y) - 1.) * 6.));
            
            //Second Layer
            vec3 p2 = vec3(uvs / (4.+sin(iTime*0.11)*0.2+0.2+sin(iTime*0.15)*0.3+0.4), 1.5) + vec3(2., -1.3, -1.);
            p2 += 0.25 * vec3(sin(iTime / 16.), sin(iTime / 12.),  sin(iTime / 128.));
            float t2 = field2(p2,freqs[3]);
            vec4 c2 = mix(.4, 1., v) * vec4(1.3 * t2 * t2 * t2 ,1.8  * t2 * t2 , t2* freqs[0], t2);
            
            
            //Let's add some stars
            //Thanks to http://glsl.heroku.com/e#6904.0
            vec2 seed = p.xy * 2.0;	
            seed = floor(seed * iResolution.x);
            vec3 rnd = nrand3( seed );
            vec4 starcolor = vec4(pow(rnd.y,40.0));
            
            //Second Layer
            vec2 seed2 = p2.xy * 2.0;
            seed2 = floor(seed2 * iResolution.x);
            vec3 rnd2 = nrand3( seed2 );
            starcolor += vec4(pow(rnd2.y,40.0));
            
            fragColor = mix(freqs[3]-.3, 1., v) * vec4(1.5*freqs[2] * t * t* t , 1.2*freqs[1] * t * t, freqs[3]*t, 1.0)+c2+starcolor;
        }
       `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex$3;
        material.userData.timeOffset = (Math.random() + 0.5) * 100000;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex$3;
    }
};

// simple shader taken from https://www.shadertoy.com/view/4sGSzc
const glsl$b = String.raw;
const uniforms$4 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
});
const loader$7 = new THREE.TextureLoader();
var noiseTex$2;
loader$7.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$2 = noise;
});
let LaceTunnelShader = {
    uniforms: uniforms$4,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$b `
      uniform sampler2D iChannel0;
        `,
        functions: glsl$b `
        // Created by Stephane Cuillerdier - Aiekick/2015 (twitter:@aiekick)
        // License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
        // Tuned via XShade (http://www.funparadigm.com/xshade/)
        
        vec2 lt_mo = vec2(0);
        
        float lt_pn( in vec3 x ) // iq noise
        {
            vec3 p = floor(x);
            vec3 f = fract(x);
            f = f*f*(3.0-2.0*f);
            vec2 uv = (p.xy+vec2(37.0,17.0)*p.z) + f.xy;
            vec2 rg = texture(iChannel0, (uv+ 0.5)/256.0, -100.0 ).yx;
            return -1.0+2.4*mix( rg.x, rg.y, f.z );
        }
        
        vec2 lt_path(float t)
        {
            return vec2(cos(t*0.2), sin(t*0.2)) * 2.;
        }
        
        const mat3 lt_mx = mat3(1,0,0,0,7,0,0,0,7);
        const mat3 lt_my = mat3(7,0,0,0,1,0,0,0,7);
        const mat3 lt_mz = mat3(7,0,0,0,7,0,0,0,1);
        
        // base on shane tech in shader : One Tweet Cellular Pattern
        float lt_func(vec3 p)
        {
            p = fract(p/68.6) - .5;
            return min(min(abs(p.x), abs(p.y)), abs(p.z)) + 0.1;
        }
        
        vec3 lt_effect(vec3 p)
        {
            p *= lt_mz * lt_mx * lt_my * sin(p.zxy); // sin(p.zxy) is based on iq tech from shader (Sculpture III)
            return vec3(min(min(lt_func(p*lt_mx), lt_func(p*lt_my)), lt_func(p*lt_mz))/.6);
        }
        //
        
        vec4 lt_displacement(vec3 p)
        {
            vec3 col = 1.-lt_effect(p*0.8);
               col = clamp(col, -.5, 1.);
            float dist = dot(col,vec3(0.023));
            col = step(col, vec3(0.82));// black line on shape
            return vec4(dist,col);
        }
        
        vec4 lt_map(vec3 p)
        {
            p.xy -= lt_path(p.z);
            vec4 disp = lt_displacement(sin(p.zxy*2.)*0.8);
            p += sin(p.zxy*.5)*1.5;
            float l = length(p.xy) - 4.;
            return vec4(max(-l + 0.09, l) - disp.x, disp.yzw);
        }
        
        vec3 lt_nor( in vec3 pos, float prec )
        {
            vec3 eps = vec3( prec, 0., 0. );
            vec3 lt_nor = vec3(
                lt_map(pos+eps.xyy).x - lt_map(pos-eps.xyy).x,
                lt_map(pos+eps.yxy).x - lt_map(pos-eps.yxy).x,
                lt_map(pos+eps.yyx).x - lt_map(pos-eps.yyx).x );
            return normalize(lt_nor);
        }
        
        
        vec4 lt_light(vec3 ro, vec3 rd, float d, vec3 lightpos, vec3 lc)
        {
            vec3 p = ro + rd * d;
            
            // original normale
            vec3 n = lt_nor(p, 0.1);
            
            vec3 lightdir = lightpos - p;
            float lightlen = length(lightpos - p);
            lightdir /= lightlen;
            
            float amb = 0.6;
            float diff = clamp( dot( n, lightdir ), 0.0, 1.0 );
                
            vec3 brdf = vec3(0);
            brdf += amb * vec3(0.2,0.5,0.3); // color mat
            brdf += diff * 0.6;
            
            brdf = mix(brdf, lt_map(p).yzw, 0.5);// merge light and black line pattern
                
            return vec4(brdf, lightlen);
        }
        
        vec3 lt_stars(vec2 uv, vec3 rd, float d, vec2 s, vec2 g)
        {
            uv *= 800. * s.x/s.y;
            float k = fract( cos(uv.y * 0.0001 + uv.x) * 90000.);
            float var = sin(lt_pn(d*0.6+rd*182.14))*0.5+0.5;// thank to klems for the variation in my shader subluminic
            vec3 col = vec3(mix(0., 1., var*pow(k, 200.)));// come from CBS Shader "Simplicity" : https://www.shadertoy.com/view/MslGWN
            return col;
        }
        
        ////////MAIN///////////////////////////////
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            vec2 s = iResolution.xy;
            vec2 g = fragCoord;
            
           
            float time = iTime*1.0;
            float cam_a = time; // angle z
            
            float cam_e = 3.2; // elevation
            float cam_d = 4.; // distance to origin axis
            
            float maxd = 40.; // ray marching distance max
            
            vec2 uv = (g*2.-s)/s.y;
            
            vec3 col = vec3(0.);
        
            vec3 ro = vec3(lt_path(time)+lt_mo,time);
              vec3 cv = vec3(lt_path(time+0.1)+lt_mo,time+0.1);
            
            vec3 cu=vec3(0,1,0);
              vec3 rov = normalize(cv-ro);
            vec3 u = normalize(cross(cu,rov));
              vec3 v = cross(rov,u);
              vec3 rd = normalize(rov + uv.x*u + uv.y*v);
            
            vec3 curve0 = vec3(0);
            vec3 curve1 = vec3(0);
            vec3 curve2 = vec3(0);
            float outStep = 0.;
            
            float ao = 0.; // ao low cost :)
            
            float st = 0.;
            float d = 0.;
            for(int i=0;i<250;i++)
            {      
                if (st<0.025*log(d*d/st/1e5)||d>maxd) break;// special break condition for low thickness object
                st = lt_map(ro+rd*d).x;
                d += st * 0.6; // the 0.6 is selected according to the 1e5 and the 0.025 of the break condition for good result
                ao++;
            }

            if (d < maxd)
            {
                vec4 li = lt_light(ro, rd, d, ro, vec3(0));// point light on the cam
                col = li.xyz/(li.w*0.2);// cheap light attenuation
                
                   col = mix(vec3(1.-ao/100.), col, 0.5);// low cost ao :)
                fragColor.rgb = mix( col, vec3(0), 1.0-exp( -0.003*d*d ) );
            }
            else
            {
                  fragColor.rgb = lt_stars(uv, rd, d, s, fragCoord);// stars bg
            }

            // vignette
            vec2 q = fragCoord/s;
            fragColor.rgb *= 0.5 + 0.5*pow( 16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.25 ); // iq vignette
                
        }
       `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex$2;
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex$2;
    }
};

var smallNoise = "https://williamcaseylucas.github.io/core-components/f27e0104605f0cd7.png";

// simple shader taken from https://www.shadertoy.com/view/MdfGRX
const glsl$a = String.raw;
const uniforms$3 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null },
    iChannelResolution: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] }
});
const loader$6 = new THREE.TextureLoader();
var noiseTex$1;
loader$6.load(smallNoise, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex$1 = noise;
    console.log("noise texture size: ", noise.image.width, noise.image.height);
});
let FireTunnelShader = {
    uniforms: uniforms$3,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$a `
      uniform sampler2D iChannel0;
      uniform vec3 iChannelResolution[4];
        `,
        functions: glsl$a `
        // Created by inigo quilez - iq/2013
// I share this piece (art and code) here in Shadertoy and through its Public API, only for educational purposes. 
// You cannot use, sell, share or host this piece or modifications of it as part of your own commercial or non-commercial product, website or project.
// You can share a link to it or an unmodified screenshot of it provided you attribute "by Inigo Quilez, @iquilezles and iquilezles.org". 
// If you are a techer, lecturer, educator or similar and these conditions are too restrictive for your needs, please contact me and we'll work it out.

float fire_noise( in vec3 x )
{
    vec3 p = floor(x);
    vec3 f = fract(x);
	f = f*f*(3.0-2.0*f);
	
	vec2 uv = (p.xy+vec2(37.0,17.0)*p.z) + f.xy;
	vec2 rg = textureLod( iChannel0, (uv+ 0.5)/256.0, 0.0 ).yx;
	return mix( rg.x, rg.y, f.z );
}

vec4 fire_map( vec3 p )
{
	float den = 0.2 - p.y;

    // invert space	
	p = -7.0*p/dot(p,p);

    // twist space	
	float co = cos(den - 0.25*iTime);
	float si = sin(den - 0.25*iTime);
	p.xz = mat2(co,-si,si,co)*p.xz;

    // smoke	
	float f;
	vec3 q = p                          - vec3(0.0,1.0,0.0)*iTime;;
    f  = 0.50000*fire_noise( q ); q = q*2.02 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.25000*fire_noise( q ); q = q*2.03 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.12500*fire_noise( q ); q = q*2.01 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.06250*fire_noise( q ); q = q*2.02 - vec3(0.0,1.0,0.0)*iTime;
    f += 0.03125*fire_noise( q );

	den = clamp( den + 4.0*f, 0.0, 1.0 );
	
	vec3 col = mix( vec3(1.0,0.9,0.8), vec3(0.4,0.15,0.1), den ) + 0.05*sin(p);
	
	return vec4( col, den );
}

vec3 raymarch( in vec3 ro, in vec3 rd, in vec2 pixel )
{
	vec4 sum = vec4( 0.0 );

	float t = 0.0;

    // dithering	
	t += 0.05*textureLod( iChannel0, pixel.xy/iChannelResolution[0].x, 0.0 ).x;
	
	for( int i=0; i<100; i++ )
	{
		if( sum.a > 0.99 ) break;
		
		vec3 pos = ro + t*rd;
		vec4 col = fire_map( pos );
		
		col.xyz *= mix( 3.1*vec3(1.0,0.5,0.05), vec3(0.48,0.53,0.5), clamp( (pos.y-0.2)/2.0, 0.0, 1.0 ) );
		
		col.a *= 0.6;
		col.rgb *= col.a;

		sum = sum + col*(1.0 - sum.a);	

		t += 0.05;
	}

	return clamp( sum.xyz, 0.0, 1.0 );
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
	vec2 q = fragCoord.xy / iResolution.xy;
    vec2 p = -1.0 + 2.0*q;
    p.x *= iResolution.x/ iResolution.y;
	
    vec2 mo = vec2(0.5,0.5); //iMouse.xy / iResolution.xy;
    //if( iMouse.w<=0.00001 ) mo=vec2(0.0);
	
    // camera
    vec3 ro = 4.0*normalize(vec3(cos(3.0*mo.x), 1.4 - 1.0*(mo.y-.1), sin(3.0*mo.x)));
	vec3 ta = vec3(0.0, 1.0, 0.0);
	float cr = 0.5*cos(0.7*iTime);
	
    // shake		
	ro += 0.1*(-1.0+2.0*textureLod( iChannel0, iTime*vec2(0.010,0.014), 0.0 ).xyz);
	ta += 0.1*(-1.0+2.0*textureLod( iChannel0, iTime*vec2(0.013,0.008), 0.0 ).xyz);
	
	// build ray
    vec3 ww = normalize( ta - ro);
    vec3 uu = normalize(cross( vec3(sin(cr),cos(cr),0.0), ww ));
    vec3 vv = normalize(cross(ww,uu));
    vec3 rd = normalize( p.x*uu + p.y*vv + 2.0*ww );
	
    // raymarch	
	vec3 col = raymarch( ro, rd, fragCoord );
	
	// contrast and vignetting	
	col = col*0.5 + 0.5*col*col*(3.0-2.0*col);
	col *= 0.25 + 0.75*pow( 16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.1 );
	
    fragColor = vec4( col, 1.0 );
}

       `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex$1;
        material.userData.timeOffset = (Math.random() + 0.5) * 100000;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex$1;
        material.uniforms.iChannelResolution.value[0].x = noiseTex$1.image.width;
        material.uniforms.iChannelResolution.value[0].y = noiseTex$1.image.height;
    }
};

// simple shader taken from https://www.shadertoy.com/view/7lfXRB
const glsl$9 = String.raw;
let MistShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl$9 `

        float mrand(vec2 coords)
        {
            return fract(sin(dot(coords, vec2(56.3456,78.3456)) * 5.0) * 10000.0);
        }
        
        float mnoise(vec2 coords)
        {
            vec2 i = floor(coords);
            vec2 f = fract(coords);
        
            float a = mrand(i);
            float b = mrand(i + vec2(1.0, 0.0));
            float c = mrand(i + vec2(0.0, 1.0));
            float d = mrand(i + vec2(1.0, 1.0));
        
            vec2 cubic = f * f * (3.0 - 2.0 * f);
        
            return mix(a, b, cubic.x) + (c - a) * cubic.y * (1.0 - cubic.x) + (d - b) * cubic.x * cubic.y;
        }
        
        float fbm(vec2 coords)
        {
            float value = 0.0;
            float scale = 0.5;
        
            for (int i = 0; i < 10; i++)
            {
                value += mnoise(coords) * scale;
                coords *= 4.0;
                scale *= 0.5;
            }
        
            return value;
        }
        
        
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            vec2 uv = fragCoord.xy / iResolution.y * 2.0;
         
            float final = 0.0;
            
            for (int i =1; i < 6; i++)
            {
                vec2 motion = vec2(fbm(uv + vec2(0.0,iTime) * 0.05 + vec2(i, 0.0)));
        
                final += fbm(uv + motion);
        
            }
            
            final /= 5.0;
            fragColor = vec4(mix(vec3(-0.3), vec3(0.45, 0.4, 0.6) + vec3(0.6), final), 1);
        }
    `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.0012) + material.userData.timeOffset;
    }
};

const glsl$8 = String.raw;
const state = {
    animate: false,
    noiseMode: 'scale',
    invert: false,
    sharpen: true,
    scaleByPrev: false,
    gain: 0.54,
    lacunarity: 2.0,
    octaves: 5,
    scale1: 3.0,
    scale2: 3.0,
    timeScaleX: 0.4,
    timeScaleY: 0.3,
    color1: [0, 0, 0],
    color2: [130, 129, 129],
    color3: [110, 110, 110],
    color4: [82, 51, 13],
    offsetAX: 0,
    offsetAY: 0,
    offsetBX: 3.7,
    offsetBY: 0.9,
    offsetCX: 2.1,
    offsetCY: 3.2,
    offsetDX: 4.3,
    offsetDY: 2.8,
    offsetX: 0,
    offsetY: 0,
};
let Marble1Shader = {
    uniforms: {
        mb_animate: { value: state.animate },
        mb_color1: { value: state.color1.map(c => c / 255) },
        mb_color2: { value: state.color2.map(c => c / 255) },
        mb_color3: { value: state.color3.map(c => c / 255) },
        mb_color4: { value: state.color4.map(c => c / 255) },
        mb_gain: { value: state.gain },
        mb_invert: { value: state.invert },
        mb_lacunarity: { value: state.lacunarity },
        mb_noiseMode: { value: 0  },
        mb_octaves: { value: state.octaves },
        mb_offset: { value: [state.offsetX, state.offsetY] },
        mb_offsetA: { value: [state.offsetAX, state.offsetAY] },
        mb_offsetB: { value: [state.offsetBX, state.offsetBY] },
        mb_offsetC: { value: [state.offsetCX, state.offsetCY] },
        mb_offsetD: { value: [state.offsetDX, state.offsetDY] },
        mb_scale1: { value: state.scale1 },
        mb_scale2: { value: state.scale2 },
        mb_scaleByPrev: { value: state.scaleByPrev },
        mb_sharpen: { value: state.sharpen },
        mb_time: { value: 0 },
        mb_timeScale: { value: [state.timeScaleX, state.timeScaleY] },
        texRepeat: { value: new THREE.Vector2(1, 1) },
        texOffset: { value: new THREE.Vector2(0, 0) }
    },
    vertexShader: {},
    fragmentShader: {
        uniforms: glsl$8 `
            uniform bool mb_animate;
            uniform vec3 mb_color1;
            uniform vec3 mb_color2;
            uniform vec3 mb_color3;
            uniform vec3 mb_color4;
            uniform float mb_gain;
            uniform bool mb_invert;
            uniform float mb_lacunarity;
            uniform int mb_noiseMode;
            uniform int mb_octaves;
            uniform vec2 mb_offset;
            uniform vec2 mb_offsetA;
            uniform vec2 mb_offsetB;
            uniform vec2 mb_offsetC;
            uniform vec2 mb_offsetD;
            uniform float mb_scale1;
            uniform float mb_scale2;
            uniform bool mb_scaleByPrev;
            uniform bool mb_sharpen;
            uniform float mb_time;
            uniform vec2 mb_timeScale;
            uniform vec2 texRepeat;
            uniform vec2 texOffset;
                    `,
        functions: glsl$8 `
        // Some useful functions
        vec3 mb_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mb_mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 mb_permute(vec3 x) { return mb_mod289(((x*34.0)+1.0)*x); }
        
        //
        // Description : GLSL 2D simplex noise function
        //      Author : Ian McEwan, Ashima Arts
        //  Maintainer : ijm
        //     Lastmod : 20110822 (ijm)
        //     License :
        //  Copyright (C) 2011 Ashima Arts. All rights reserved.
        //  Distributed under the MIT License. See LICENSE file.
        //  https://github.com/ashima/webgl-noise
        //
        float mb_snoise(vec2 v) {
            // Precompute values for skewed triangular grid
            const vec4 C = vec4(0.211324865405187,
                                // (3.0-sqrt(3.0))/6.0
                                0.366025403784439,
                                // 0.5*(sqrt(3.0)-1.0)
                                -0.577350269189626,
                                // -1.0 + 2.0 * C.x
                                0.024390243902439);
                                // 1.0 / 41.0
        
            // First corner (x0)
            vec2 i  = floor(v + dot(v, C.yy));
            vec2 x0 = v - i + dot(i, C.xx);
        
            // Other two corners (x1, x2)
            vec2 i1 = vec2(0.0);
            i1 = (x0.x > x0.y)? vec2(1.0, 0.0):vec2(0.0, 1.0);
            vec2 x1 = x0.xy + C.xx - i1;
            vec2 x2 = x0.xy + C.zz;
        
            // Do some permutations to avoid
            // truncation effects in permutation
            i = mb_mod289(i);
            vec3 p = mb_permute(
                    mb_permute( i.y + vec3(0.0, i1.y, 1.0))
                        + i.x + vec3(0.0, i1.x, 1.0 ));
        
            vec3 m = max(0.5 - vec3(
                                dot(x0,x0),
                                dot(x1,x1),
                                dot(x2,x2)
                                ), 0.0);
        
            m = m*m;
            m = m*m;
        
            // Gradients:
            //  41 pts uniformly over a line, mapped onto a diamond
            //  The ring size 17*17 = 289 is close to a multiple
            //      of 41 (41*7 = 287)
        
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
        
            // Normalise gradients implicitly by scaling m
            // Approximation of: m *= inversesqrt(a0*a0 + h*h);
            m *= 1.79284291400159 - 0.85373472095314 * (a0*a0+h*h);
        
            // Compute final noise value at P
            vec3 g = vec3(0.0);
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * vec2(x1.x,x2.x) + h.yz * vec2(x1.y,x2.y);
            return 130.0 * dot(m, g);
        }
        
        float mb_getNoiseVal(vec2 p) {
            float raw = mb_snoise(p);
        
            if (mb_noiseMode == 1) {
                return abs(raw);
            }
        
            return raw * 0.5 + 0.5;
        }
        
        float mb_fbm(vec2 p) {
            float sum = 0.0;
            float freq = 1.0;
            float amp = 0.5;
            float prev = 1.0;
        
            for (int i = 0; i < mb_octaves; i++) {
                float n = mb_getNoiseVal(p * freq);
        
                if (mb_invert) {
                    n = 1.0 - n;
                }
        
                if (mb_sharpen) {
                    n = n * n;
                }
        
                sum += n * amp;
        
                if (mb_scaleByPrev) {
                    sum += n * amp * prev;
                }
        
                prev = n;
                freq *= mb_lacunarity;
                amp *= mb_gain;
            }
        
            return sum;
        }
        
        float mb_pattern(in vec2 p, out vec2 q, out vec2 r) {
            p *= mb_scale1;
            p += mb_offset;
        
            float t = 0.0;
            if (mb_animate) {
                t = mb_time * 0.1;
            }
        
            q = vec2(mb_fbm(p + mb_offsetA + t * mb_timeScale.x), mb_fbm(p + mb_offsetB - t * mb_timeScale.y));
            r = vec2(mb_fbm(p + mb_scale2 * q + mb_offsetC), mb_fbm(p + mb_scale2 * q + mb_offsetD));
        
            return mb_fbm(p + mb_scale2 * r);
        }
    `,
        replaceMap: glsl$8 `
        vec3 marbleColor = vec3(0.0);

        vec2 q;
        vec2 r;

        vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); 
        if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
        if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
        uv.x = clamp(uv.x, 0.0, 1.0);
        uv.y = clamp(uv.y, 0.0, 1.0);

        float f = mb_pattern(uv, q, r);
        
        marbleColor = mix(mb_color1, mb_color2, f);
        marbleColor = mix(marbleColor, mb_color3, length(q) / 2.0);
        marbleColor = mix(marbleColor, mb_color4, r.y / 2.0);

        vec4 marbleColor4 = mapTexelToLinear( vec4(marbleColor,1.0) );

        diffuseColor *= marbleColor4;
    `
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.mb_invert = { value: mat.map.flipY ? state.invert : !state.invert };
        material.uniforms.mb_offsetA = { value: new THREE.Vector2(state.offsetAX + Math.random(), state.offsetAY + Math.random()) };
        material.uniforms.mb_offsetB = { value: new THREE.Vector2(state.offsetBX + Math.random(), state.offsetBY + Math.random()) };
    },
    updateUniforms: function (time, material) {
        material.uniforms.mb_time.value = time * 0.001;
    }
};

var notFound = "https://williamcaseylucas.github.io/core-components/1ec965c5d6df577c.jpg";

// simple shader taken from https://www.shadertoy.com/view/4t33z8
const glsl$7 = String.raw;
const uniforms$2 = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null },
    iChannel1: { value: null }
});
const loader$5 = new THREE.TextureLoader();
var noiseTex;
loader$5.load(smallNoise$1, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex = noise;
});
var notFoundTex;
loader$5.load(notFound, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    notFoundTex = noise;
});
let NotFoundShader = {
    uniforms: uniforms$2,
    vertexShader: {},
    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl$7 `
        uniform sampler2D iChannel0;
        uniform sampler2D iChannel1;
        `,
        functions: glsl$7 `
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            vec2 uv = fragCoord.xy / iResolution.xy;
            vec2 warpUV = 2. * uv;
        
            float d = length( warpUV );
            vec2 st = warpUV*0.1 + 0.2*vec2(cos(0.071*iTime*2.+d),
                                        sin(0.073*iTime*2.-d));
        
            vec3 warpedCol = texture( iChannel0, st ).xyz * 2.0;
            float w = max( warpedCol.r, 0.85);
            
            vec2 offset = 0.01 * cos( warpedCol.rg * 3.14159 );
            vec3 col = texture( iChannel1, uv + offset ).rgb * vec3(0.8, 0.8, 1.5) ;
            col *= w*1.2;
            
            fragColor = vec4( mix(col, texture( iChannel1, uv + offset ).rgb, 0.5),  1.0);
        }
        `,
        replaceMap: shaderToyMain
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.uniforms.iChannel0.value = noiseTex;
        material.uniforms.iChannel1.value = notFoundTex;
        material.userData.timeOffset = (Math.random() + 0.5) * 10000;
    },
    updateUniforms: function (time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset;
        material.uniforms.iChannel0.value = noiseTex;
        material.uniforms.iChannel1.value = notFoundTex;
    }
};

var warpfx = "https://williamcaseylucas.github.io/core-components/481a92b44e56dad4.png";

const glsl$6 = String.raw;
const uniforms$1 = {
    warpTime: { value: 0 },
    warpTex: { value: null },
    texRepeat: { value: new THREE.Vector2(1, 1) },
    texOffset: { value: new THREE.Vector2(0, 0) },
    texFlipY: { value: 0 }
};
const loader$4 = new THREE.TextureLoader();
var warpTex$1;
loader$4.load(warpfx, (warp) => {
    warp.minFilter = THREE.NearestFilter;
    warp.magFilter = THREE.NearestFilter;
    warp.wrapS = THREE.RepeatWrapping;
    warp.wrapT = THREE.RepeatWrapping;
    warpTex$1 = warp;
});
let WarpShader = {
    uniforms: uniforms$1,
    vertexShader: {},
    fragmentShader: {
        uniforms: glsl$6 `
        uniform float warpTime;
        uniform sampler2D warpTex;
        uniform vec2 texRepeat;
        uniform vec2 texOffset;
        uniform int texFlipY; 
                `,
        replaceMap: glsl$6 `
          float t = warpTime;

          vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); //mod(vUv.xy * texRepeat.xy + texOffset.xy, vec2(1.0,1.0));

          if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
          if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
          if (texFlipY > 0) { uv.y = 1.0 - uv.y;}
          uv.x = clamp(uv.x, 0.0, 1.0);
          uv.y = clamp(uv.y, 0.0, 1.0);
  
          vec2 scaledUV = uv * 2.0 - 1.0;
          vec2 puv = vec2(length(scaledUV.xy), atan(scaledUV.x, scaledUV.y));
          vec4 col = texture2D(warpTex, vec2(log(puv.x) + t / 5.0, puv.y / 3.1415926 ));
          float glow = (1.0 - puv.x) * (0.5 + (sin(t) + 2.0 ) / 4.0);
          // blue glow
          col += vec4(118.0/255.0, 144.0/255.0, 219.0/255.0, 1.0) * (0.4 + glow * 1.0);
          // white glow
          col += vec4(0.2) * smoothstep(0.0, 2.0, glow * glow);
          
          col = mapTexelToLinear( col );
          diffuseColor *= col;
        `
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map.repeat };
        material.uniforms.texOffset = { value: mat.map.offset };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
        material.uniforms.warpTex.value = warpTex$1;
        // we seem to want to flip the flipY
        material.uniforms.warpTime = { value: 0 };
    },
    updateUniforms: function (time, material) {
        material.uniforms.warpTime.value = time * 0.001 + material.userData.timeOffset;
        material.uniforms.warpTex.value = warpTex$1;
    }
};

/*
 * 3D Simplex noise
 * SIGNATURE: float snoise(vec3 v)
 * https://github.com/hughsk/glsl-noise
 */
const glsl$5 = `
//
// Description : Array and textureless GLSL 2D/3D/4D simplex
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : ijm
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v)
  {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
  }  
`;

const glsl$4 = `

mat4 inverseMat(mat4 m) {
  float
      a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3],
      a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3],
      a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3],
      a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3],

      b00 = a00 * a11 - a01 * a10,
      b01 = a00 * a12 - a02 * a10,
      b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11,
      b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30,
      b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31,
      b10 = a21 * a33 - a23 * a31,
      b11 = a22 * a33 - a23 * a32,

      det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  return mat4(
      a11 * b11 - a12 * b10 + a13 * b09,
      a02 * b10 - a01 * b11 - a03 * b09,
      a31 * b05 - a32 * b04 + a33 * b03,
      a22 * b04 - a21 * b05 - a23 * b03,
      a12 * b08 - a10 * b11 - a13 * b07,
      a00 * b11 - a02 * b08 + a03 * b07,
      a32 * b02 - a30 * b05 - a33 * b01,
      a20 * b05 - a22 * b02 + a23 * b01,
      a10 * b10 - a11 * b08 + a13 * b06,
      a01 * b08 - a00 * b10 - a03 * b06,
      a30 * b04 - a31 * b02 + a33 * b00,
      a21 * b02 - a20 * b04 - a23 * b00,
      a11 * b07 - a10 * b09 - a12 * b06,
      a00 * b09 - a01 * b07 + a02 * b06,
      a31 * b01 - a30 * b03 - a32 * b00,
      a20 * b03 - a21 * b01 + a22 * b00) / det;
}
`;

const glsl$3 = String.raw;
const uniforms = {
    warpTime: { value: 0 },
    warpTex: { value: null },
    texRepeat: { value: new THREE.Vector2(1, 1) },
    texOffset: { value: new THREE.Vector2(0, 0) },
    texFlipY: { value: 0 },
    portalCubeMap: { value: new THREE.CubeTexture() },
    portalTime: { value: 0 },
    portalRadius: { value: 0.5 },
    portalRingColor: { value: new THREE.Color("red") },
    invertWarpColor: { value: 0 },
    texInvSize: { value: new THREE.Vector2(1, 1) }
};
let cubeMap = new THREE.CubeTexture();
const loader$3 = new THREE.TextureLoader();
var warpTex;
loader$3.load(warpfx, (warp) => {
    warp.minFilter = THREE.NearestMipmapNearestFilter;
    warp.magFilter = THREE.NearestMipmapNearestFilter;
    warp.wrapS = THREE.RepeatWrapping;
    warp.wrapT = THREE.RepeatWrapping;
    warpTex = warp;
    cubeMap.images = [warp.image, warp.image, warp.image, warp.image, warp.image, warp.image];
    cubeMap.needsUpdate = true;
});
let WarpPortalShader = {
    uniforms: uniforms,
    vertexShader: {
        functions: glsl$4,
        uniforms: glsl$3 `
        varying vec3 vRay;
        varying vec3 portalNormal;
        //varying vec3 cameraLocal;
        `,
        postTransform: glsl$3 `
        // vec3 cameraLocal = (inverseMat(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vec3 cameraLocal = (inverseMat(modelViewMatrix) * vec4(0.0,0.0,0.0, 1.0)).xyz;
        vRay = position - cameraLocal;
        if (vRay.z < 0.0) {
            vRay.z = -vRay.z;
            vRay.x = -vRay.x;
        }
        //vRay = vec3(mvPosition.x, mvPosition.y, mvPosition.z);
        portalNormal = normalize(-1. * vRay);
        //float portal_dist = length(cameraLocal);
        float portal_dist = length(vRay);
        vRay.z *= 1.1 / (1. + pow(portal_dist, 0.5)); // Change FOV by squashing local Z direction
      `
    },
    fragmentShader: {
        functions: glsl$5,
        uniforms: glsl$3 `
        uniform samplerCube portalCubeMap;
        uniform float portalRadius;
        uniform vec3 portalRingColor;
        uniform float portalTime;
        uniform int invertWarpColor;

        uniform vec2 texInvSize;

        varying vec3 vRay;
        varying vec3 portalNormal;
       // varying vec3 cameraLocal;

        uniform float warpTime;
        uniform sampler2D warpTex;
        uniform vec2 texRepeat;
        uniform vec2 texOffset;
        uniform int texFlipY; 

        #define RING_WIDTH 0.1
        #define RING_HARD_OUTER 0.01
        #define RING_HARD_INNER 0.08
        `,
        replaceMap: glsl$3 `
          float t = warpTime;

          vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); //mod(vUv.xy * texRepeat.xy + texOffset.xy, vec2(1.0,1.0));

          if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
          if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
          if (texFlipY > 0) { uv.y = 1.0 - uv.y;}
          uv.x = clamp(uv.x, 0.0, 1.0);
          uv.y = clamp(uv.y, 0.0, 1.0);
  
          vec2 scaledUV = uv * 2.0 - 1.0;
          vec2 puv = vec2(length(scaledUV.xy), atan(scaledUV.x, scaledUV.y));
          vec4 col = texture2D(warpTex, vec2(log(puv.x) + t / 5.0, puv.y / 3.1415926 ));

          float glow = (1.0 - puv.x) * (0.5 + (sin(t) + 2.0 ) / 4.0);
          // blue glow
          col += vec4(118.0/255.0, 144.0/255.0, 219.0/255.0, 1.0) * (0.4 + glow * 1.0);
          // white glow
          col += vec4(0.2) * smoothstep(0.0, 2.0, glow * glow);
          col = mapTexelToLinear( col );
         
          if (invertWarpColor > 0) {
              col = vec4(col.b, col.g, col.r, col.a);
          }

          /// portal shader effect
          vec2 portal_coord = vUv * 2.0 - 1.0;
          float portal_noise = snoise(vec3(portal_coord * 1., portalTime)) * 0.5 + 0.5;
        
          // Polar distance
          float portal_dist = length(portal_coord);
          portal_dist += portal_noise * 0.2;
        
          float maskOuter = 1.0 - smoothstep(portalRadius - RING_HARD_OUTER, portalRadius, portal_dist);
          float maskInner = 1.0 - smoothstep(portalRadius - RING_WIDTH, portalRadius - RING_WIDTH + RING_HARD_INNER, portal_dist);
          float portal_distortion = smoothstep(portalRadius - 0.2, portalRadius + 0.2, portal_dist);
          
          vec3 portalnormal = normalize(portalNormal);
          vec3 forwardPortal = vec3(0.0, 0.0, -1.0);

          float portal_directView = smoothstep(0.0, 0.8, dot(portalnormal, forwardPortal));
          vec3 portal_tangentOutward = normalize(vec3(portal_coord, 0.0));
          vec3 portal_ray = mix(vRay, portal_tangentOutward, portal_distortion);

          vec4 myCubeTexel = textureCube(portalCubeMap, portal_ray);

        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x - texInvSize.s, portal_ray.yz))) / 8.0;        
        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x - texInvSize.s, portal_ray.yz))) / 8.0;        
        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x, portal_ray.y - texInvSize.t, portal_ray.z))) / 8.0;        
        //   myCubeTexel += textureCube(portalCubeMap, normalize(vec3(portal_ray.x, portal_ray.y - texInvSize.t, portal_ray.z))) / 8.0;        

          myCubeTexel = mapTexelToLinear( myCubeTexel );

        //   vec4 posCol = vec4(smoothstep(-6.0, 6.0, cameraLocal), 1.0); //normalize((cameraLocal / 6.0));
        //   myCubeTexel = posCol; // vec4(posCol.x, posCol.y, posCol.y, 1.0);
          vec3 centerLayer = myCubeTexel.rgb * maskInner;
          vec3 ringLayer = portalRingColor * (1. - maskInner);
          vec3 portal_composite = centerLayer + ringLayer;
        
          //gl_FragColor 
          vec4 portalCol = vec4(portal_composite, (maskOuter - maskInner) + maskInner * portal_directView);
        
          // blend the two
          portalCol.rgb *= portalCol.a; //premultiply source 
          col.rgb *= (1.0 - portalCol.a);
          col.rgb += portalCol.rgb;

          diffuseColor *= col;
        `
    },
    init: function (material) {
        let mat = material;
        material.uniforms.texRepeat = { value: mat.map && mat.map.repeat ? mat.map.repeat : new THREE.Vector2(1, 1) };
        material.uniforms.texOffset = { value: mat.map && mat.map.offset ? mat.map.offset : new THREE.Vector2(0, 0) };
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map && mat.map.flipY ? 0 : 1 };
        material.userData.timeOffset = (Math.random() + 0.5) * 10;
        material.uniforms.warpTex.value = warpTex;
        // we seem to want to flip the flipY
        material.uniforms.warpTime = { value: 0 };
        material.uniforms.portalTime = { value: 0 };
        material.uniforms.invertWarpColor = { value: mat.userData.invertWarpColor ? mat.userData.invertWarpColor : false };
        material.uniforms.portalRingColor = { value: mat.userData.ringColor ? mat.userData.ringColor : new THREE.Color("red") };
        material.uniforms.portalCubeMap = { value: mat.userData.cubeMap ? mat.userData.cubeMap : cubeMap };
        material.uniforms.portalRadius = { value: mat.userData.radius ? mat.userData.radius : 0.5 };
    },
    updateUniforms: function (time, material) {
        material.uniforms.warpTime.value = time * 0.001 + material.userData.timeOffset;
        material.uniforms.portalTime.value = time * 0.001 + material.userData.timeOffset;
        material.uniforms.warpTex.value = warpTex;
        material.uniforms.portalCubeMap.value = material.userData.cubeMap ? material.userData.cubeMap : cubeMap;
        material.uniforms.portalRadius.value = material.userData.radius ? material.userData.radius : 0.5;
        if (material.userData.cubeMap && Array.isArray(material.userData.cubeMap.images) && material.userData.cubeMap.images[0]) {
            let height = material.userData.cubeMap.images[0].height;
            let width = material.userData.cubeMap.images[0].width;
            material.uniforms.texInvSize.value = new THREE.Vector2(width, height);
        }
    }
};

/**
 * Various simple shaders
 */
function mapMaterials(object3D, fn) {
    let mesh = object3D;
    if (!mesh.material)
        return;
    if (Array.isArray(mesh.material)) {
        return mesh.material.map(fn);
    }
    else {
        return fn(mesh.material);
    }
}
// TODO:  key a record of new materials, indexed by the original
// material UUID, so we can just return it if replace is called on
// the same material more than once
function replaceMaterial(oldMaterial, shader, userData) {
    //   if (oldMaterial.type != "MeshStandardMaterial") {
    //       console.warn("Shader Component: don't know how to handle Shaders of type '" + oldMaterial.type + "', only MeshStandardMaterial at this time.")
    //       return;
    //   }
    //const material = oldMaterial.clone();
    var CustomMaterial;
    try {
        CustomMaterial = defaultMaterialModifier.extend(oldMaterial.type, {
            uniforms: shader.uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader
        });
    }
    catch (e) {
        return null;
    }
    // create a new material, initializing the base part with the old material here
    let material = new CustomMaterial();
    switch (oldMaterial.type) {
        case "MeshStandardMaterial":
            THREE.MeshStandardMaterial.prototype.copy.call(material, oldMaterial);
            break;
        case "MeshPhongMaterial":
            THREE.MeshPhongMaterial.prototype.copy.call(material, oldMaterial);
            break;
        case "MeshBasicMaterial":
            THREE.MeshBasicMaterial.prototype.copy.call(material, oldMaterial);
            break;
    }
    material.userData = userData;
    material.needsUpdate = true;
    shader.init(material);
    return material;
}
function updateWithShader(shaderDef, el, target, userData = {}) {
    // mesh would contain the object that is, or contains, the meshes
    var mesh = el.object3DMap.mesh;
    if (!mesh) {
        // if no mesh, we'll search through all of the children.  This would
        // happen if we dropped the component on a glb in spoke
        mesh = el.object3D;
    }
    let materials = [];
    let traverse = (object) => {
        let mesh = object;
        if (mesh.material) {
            mapMaterials(mesh, (material) => {
                if (!target || material.name === target) {
                    let newM = replaceMaterial(material, shaderDef, userData);
                    if (newM) {
                        mesh.material = newM;
                        materials.push(newM);
                    }
                }
            });
        }
        const children = object.children;
        for (let i = 0; i < children.length; i++) {
            traverse(children[i]);
        }
    };
    traverse(mesh);
    return materials;
}
new THREE.Vector3();
new THREE.Vector3(0, 0, 1);
const once$2 = {
    once: true
};
AFRAME.registerComponent('shader', {
    materials: null,
    shaderDef: null,
    schema: {
        name: { type: 'string', default: "noise" },
        target: { type: 'string', default: "" } // if nothing passed, just create some noise
    },
    init: function () {
        var shaderDef;
        switch (this.data.name) {
            case "noise":
                shaderDef = NoiseShader;
                break;
            case "warp":
                shaderDef = WarpShader;
                break;
            case "warp-portal":
                shaderDef = WarpPortalShader;
                break;
            case "liquidmarble":
                shaderDef = LiquidMarbleShader;
                break;
            case "bleepyblocks":
                shaderDef = BleepyBlocksShader;
                break;
            case "galaxy":
                shaderDef = GalaxyShader;
                break;
            case "lacetunnel":
                shaderDef = LaceTunnelShader;
                break;
            case "firetunnel":
                shaderDef = FireTunnelShader;
                break;
            case "mist":
                shaderDef = MistShader;
                break;
            case "marble1":
                shaderDef = Marble1Shader;
                break;
            default:
                // an unknown name was passed in
                console.warn("unknown name '" + this.data.name + "' passed to shader component");
                shaderDef = NotFoundShader;
                break;
        }
        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        let updateMaterials = () => {
            let target = this.data.target;
            if (target.length == 0) {
                target = null;
            }
            this.materials = updateWithShader(shaderDef, this.el, target);
        };
        let initializer = () => {
            if (this.el.components["media-loader"]) {
                let fn = () => {
                    updateMaterials();
                    this.el.removeEventListener("model-loaded", fn);
                };
                this.el.addEventListener("media-loaded", fn);
            }
            else {
                updateMaterials();
            }
        };
        root && root.addEventListener("model-loaded", initializer, once$2);
        this.shaderDef = shaderDef;
    },
    tick: function (time) {
        if (this.shaderDef == null || this.materials == null) {
            return;
        }
        let shaderDef = this.shaderDef;
        this.materials.map((mat) => { shaderDef.updateUniforms(time, mat); });
        // switch (this.data.name) {
        //     case "noise":
        //         break;
        //     case "bleepyblocks":
        //         break;
        //     default:
        //         break;
        // }
        // if (this.shader) {
        //     console.log("fragment shader:", this.material.fragmentShader)
        //     this.shader = null
        // }
    },
});

const downloadBlob = function (blob, filename) {
    const a = document.createElement('a');
    a.download = filename;
    a.href = window.URL.createObjectURL(blob);
    a.dataset.downloadurl = ['application/octet-stream', a.download, a.href].join(':');
    a.click();
};

var goldcolor = "https://williamcaseylucas.github.io/core-components/2aeb00b64ae9568f.jpg";

var goldDisplacement = "https://williamcaseylucas.github.io/core-components/50a1b6d338cb246e.jpg";

var goldgloss = "https://williamcaseylucas.github.io/core-components/aeab2091e4a53e9d.png";

var goldnorm = "https://williamcaseylucas.github.io/core-components/0ce46c422f945a96.jpg";

var goldao = "https://williamcaseylucas.github.io/core-components/6a3e8b4332d47ce2.jpg";

let SIZE = 1024;
let TARGETWIDTH = SIZE;
let TARGETHEIGHT = SIZE;

window.APP.writeWayPointTextures = function(names) {
    if ( !Array.isArray( names ) ) {
        names = [ names ];
    }

    for ( let k = 0; k < names.length; k++ ) {
        let waypoints = document.getElementsByClassName(names[k]);
        for (let i = 0; i < waypoints.length; i++) {
            if (waypoints[i].components.waypoint) {
                let cubecam = null;
                // 
                // for (let j = 0; j < waypoints[i].object3D.children.length; j++) {
                //     if (waypoints[i].object3D.children[j] instanceof CubeCameraWriter) {
                //         console.log("found waypoint with cubeCamera '" + names[k] + "'")
                //         cubecam = waypoints[i].object3D.children[j]
                //         break;
                //     }
                // }
                // if (!cubecam) {
                    console.log("didn't find waypoint with cubeCamera '" + names[k] + "', creating one.");                    // create a cube map camera and render the view!
                    if (THREE.REVISION < 125) {   
                        cubecam = new CubeCameraWriter(0.1, 1000, SIZE);
                    } else {
                        const cubeRenderTarget = new THREE.WebGLCubeRenderTarget( SIZE, { encoding: THREE.sRGBEncoding, generateMipmaps: true } );
                        cubecam = new CubeCameraWriter(1, 100000, cubeRenderTarget);
                    }
        
                    cubecam.position.y = 1.6;
                    cubecam.needsUpdate = true;
                    waypoints[i].object3D.add(cubecam);
                    cubecam.update(window.APP.scene.renderer, 
                                   window.APP.scene.object3D);
                // }                

                cubecam.saveCubeMapSides(names[k]);
                waypoints[i].object3D.remove(cubecam);
                break;
            }
        }
    }
};

class CubeCameraWriter extends THREE.CubeCamera {

    constructor(...args) {
        super(...args);

        this.canvas = document.createElement('canvas');
        this.canvas.width = TARGETWIDTH;
        this.canvas.height = TARGETHEIGHT;
        this.ctx = this.canvas.getContext('2d');
        // this.renderTarget.texture.generateMipmaps = true;
        // this.renderTarget.texture.minFilter = THREE.LinearMipMapLinearFilter;
        // this.renderTarget.texture.magFilter = THREE.LinearFilter;

        // this.update = function( renderer, scene ) {

        //     let [ cameraPX, cameraNX, cameraPY, cameraNY, cameraPZ, cameraNZ ] = this.children;

    	// 	if ( this.parent === null ) this.updateMatrixWorld();

    	// 	if ( this.parent === null ) this.updateMatrixWorld();

    	// 	var currentRenderTarget = renderer.getRenderTarget();

    	// 	var renderTarget = this.renderTarget;
    	// 	//var generateMipmaps = renderTarget.texture.generateMipmaps;

    	// 	//renderTarget.texture.generateMipmaps = false;

    	// 	renderer.setRenderTarget( renderTarget, 0 );
    	// 	renderer.render( scene, cameraPX );

    	// 	renderer.setRenderTarget( renderTarget, 1 );
    	// 	renderer.render( scene, cameraNX );

    	// 	renderer.setRenderTarget( renderTarget, 2 );
    	// 	renderer.render( scene, cameraPY );

    	// 	renderer.setRenderTarget( renderTarget, 3 );
    	// 	renderer.render( scene, cameraNY );

    	// 	renderer.setRenderTarget( renderTarget, 4 );
    	// 	renderer.render( scene, cameraPZ );

    	// 	//renderTarget.texture.generateMipmaps = generateMipmaps;

    	// 	renderer.setRenderTarget( renderTarget, 5 );
    	// 	renderer.render( scene, cameraNZ );

    	// 	renderer.setRenderTarget( currentRenderTarget );
        // };
	}

    saveCubeMapSides(slug) {
        for (let i = 0; i < 6; i++) {
            this.capture(slug, i);
        }
    }
    
    capture (slug, side) {
        //var isVREnabled = window.APP.scene.renderer.xr.enabled;
        window.APP.scene.renderer;
        // Disable VR.
        //renderer.xr.enabled = false;
        this.renderCapture(side);
        // Trigger file download.
        this.saveCapture(slug, side);
        // Restore VR.
        //renderer.xr.enabled = isVREnabled;
     }

    renderCapture (cubeSide) {
        var imageData;
        var pixels3 = new Uint8Array(4 * TARGETWIDTH * TARGETHEIGHT);
        var renderer = window.APP.scene.renderer;

        renderer.readRenderTargetPixels(this.renderTarget, 0, 0, TARGETWIDTH,TARGETHEIGHT, pixels3, cubeSide);

        //pixels3 = this.flipPixelsVertically(pixels3, TARGETWIDTH, TARGETHEIGHT);
        var pixels4 = pixels3;  //this.convert3to4(pixels3, TARGETWIDTH, TARGETHEIGHT);
        imageData = new ImageData(new Uint8ClampedArray(pixels4), TARGETWIDTH, TARGETHEIGHT);

        // Copy pixels into canvas.

        // could use drawImage instead, to scale, if we want
        this.ctx.putImageData(imageData, 0, 0);
    }

    flipPixelsVertically (pixels, width, height) {
        var flippedPixels = pixels.slice(0);
        for (var x = 0; x < width; ++x) {
          for (var y = 0; y < height; ++y) {
            flippedPixels[x * 3 + y * width * 3] = pixels[x * 3 + (height - y - 1) * width * 3];
            flippedPixels[x * 3 + 1 + y * width * 3] = pixels[x * 3 + 1 + (height - y - 1) * width * 3];
            flippedPixels[x * 3 + 2 + y * width * 3] = pixels[x * 3 + 2 + (height - y - 1) * width * 3];
          }
        }
        return flippedPixels;
    }

    convert3to4 (pixels, width, height) {
        var newPixels = new Uint8Array(4 * TARGETWIDTH * TARGETHEIGHT);

        for (var x = 0; x < width; ++x) {
          for (var y = 0; y < height; ++y) {
            newPixels[x * 4 + y * width * 4] = pixels[x * 3 + y * width * 3];
            newPixels[x * 4 + 1 + y * width * 4] = pixels[x * 3 + 1 + y * width * 3];
            newPixels[x * 4 + 2 + y * width * 4] = pixels[x * 3 + 2 + y * width * 3];
            newPixels[x * 4 + 3 + y * width * 4] = 255;
          }
        }
        return newPixels;
    }


    sides = [
        "Right", "Left", "Top", "Bottom", "Front", "Back"
    ]

    saveCapture (slug, side) {
        this.canvas.toBlob( (blob) => {
            var fileName = slug + '-' + this.sides[side] + '.png';
            var linkEl = document.createElement('a');
            var url = URL.createObjectURL(blob);
            linkEl.href = url;
            linkEl.setAttribute('download', fileName);
            linkEl.innerHTML = 'downloading...';
            linkEl.style.display = 'none';
            document.body.appendChild(linkEl);
            setTimeout(function () {
                linkEl.click();
                document.body.removeChild(linkEl);
            }, 1);
        }, 'image/png');
    }
}

/**
 * Description
 * ===========
 * Bidirectional see-through portal. Two portals are paired by color.
 *
 * Usage
 * =======
 * Add two instances of `portal.glb` to the Spoke scene.
 * The name of each instance should look like "some-descriptive-label__color"
 * Any valid THREE.Color argument is a valid color value.
 * See here for example color names https://www.w3schools.com/cssref/css_colors.asp
 *
 * For example, to make a pair of connected blue portals,
 * you could name them "portal-to__blue" and "portal-from__blue"
 */

const worldPos = new THREE.Vector3();
const worldCameraPos$1 = new THREE.Vector3();
const worldDir = new THREE.Vector3();
const worldQuat = new THREE.Quaternion();
const mat4 = new THREE.Matrix4();

// load and setup all the bits of the textures for the door
const loader$2 = new THREE.TextureLoader();
const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.0, 
    //emissiveIntensity: 1
});
const doormaterialY = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0, 
    //emissiveIntensity: 1
});

loader$2.load(goldcolor, (color) => {
    doorMaterial.map = color;
    color.repeat.set(1,25);
    color.wrapS = THREE.RepeatWrapping;
    color.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});
loader$2.load(goldcolor, (color) => {
    //color = color.clone()
    doormaterialY.map = color;
    color.repeat.set(1,1);
    color.wrapS = THREE.ClampToEdgeWrapping;
    color.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

loader$2.load(goldDisplacement, (disp) => {
    doorMaterial.bumpMap = disp;
    disp.repeat.set(1,25);
    disp.wrapS = THREE.RepeatWrapping;
    disp.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});

loader$2.load(goldDisplacement, (disp) => {
    //disp = disp.clone()
    doormaterialY.bumpMap = disp;
    disp.repeat.set(1,1);
    disp.wrapS = THREE.ClampToEdgeWrapping;
    disp.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

loader$2.load(goldgloss, (gloss) => {
    doorMaterial.roughness = gloss;
    gloss.repeat.set(1,25);
    gloss.wrapS = THREE.RepeatWrapping;
    gloss.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});

loader$2.load(goldgloss, (gloss) => {
    //gloss = gloss.clone()
    doormaterialY.roughness = gloss;
    gloss.repeat.set(1,1);
    gloss.wrapS = THREE.ClampToEdgeWrapping;
    gloss.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});
         
loader$2.load(goldao, (ao) => {
    doorMaterial.aoMap = ao;
    ao.repeat.set(1,25);
    ao.wrapS = THREE.RepeatWrapping;
    ao.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});
         
loader$2.load(goldao, (ao) => {
    // ao = ao.clone()
    doormaterialY.aoMap = ao;
    ao.repeat.set(1,1);
    ao.wrapS = THREE.ClampToEdgeWrapping;
    ao.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

loader$2.load(goldnorm, (norm) => {
    doorMaterial.normalMap = norm;
    norm.repeat.set(1,25);
    norm.wrapS = THREE.RepeatWrapping;
    norm.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true;
});

loader$2.load(goldnorm, (norm) => {
    // norm = norm.clone()
    doormaterialY.normalMap = norm;
    norm.repeat.set(1,1);
    norm.wrapS = THREE.ClampToEdgeWrapping;
    norm.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true;
});

// // map all materials via a callback.  Taken from hubs materials-utils
// function mapMaterials(object3D, fn) {
//     let mesh = object3D 
//     if (!mesh.material) return;
  
//     if (Array.isArray(mesh.material)) {
//       return mesh.material.map(fn);
//     } else {
//       return fn(mesh.material);
//     }
// }
  
const waitForEvent = function(eventName, eventObj) {
    return new Promise(resolve => {
      eventObj.addEventListener(eventName, resolve, { once: true });
    });
  };
  
const waitForDOMContentLoaded = function() {
    if (document.readyState === "complete" || document.readyState === "loaded" || document.readyState === "interactive") {
        return Promise.resolve(null);
    } else {
        return waitForEvent("DOMContentLoaded", window);
    }
};
  
  

//  scene.emit("hub_updated", { hub });

const once$1 = {
    once : true
};

AFRAME.registerSystem('portal', {
  dependencies: ['fader-plus'],
  init: function () {
    this.teleporting = false;
    this.characterController = this.el.systems['hubs-systems'].characterController;
    this.fader = this.el.systems['fader-plus'];
    this.roomData = null;
    this.cacheLoaded = false;

    waitForDOMContentLoaded().then(() => {
        setTimeout(() => {
            // want to let other domcontentloaded events to finish
            // before we run, so SSO is set up (if it will be)
            this.fetchRoomData();
        },1);
    });
  },

  fetchRoomData: async function () {  
    this.loadLayerCache();

    // if we are running on realitymedia.digital, this will be set.  IF we are not,
    // it won't be set, so just back out
    if (!window.SSO) {
        this.roomData = {
            roomId: -1,
            localRooms: []
        };
        return
    }

    await this.waitForFetch();
    let hubId = window.APP.hubChannel.hubId;
    let found = false;
    found = window.SSO.userInfo.rooms.find((el, index) => {
        if (el == hubId) {
            this.roomData = {
                roomId: index,
                localRooms: []
            };
            return;
        } 
    });

    if (!found) {
        const options = {};
        options.headers = new Headers();
        //options.headers.set("Authorization", `Bearer ${params}`);
        options.headers.set("Content-Type", "application/json");
        options.credentials = "include", // use cookie
        await fetch("https://realitymedia.digital/sso/userRooms/?email=" + 
            encodeURIComponent(window.APP.store.state.credentials.email) + "&token=" + 
            encodeURIComponent(window.APP.store.state.credentials.token) + "&hubId=" +
            encodeURIComponent(hubId), options)
            .then(response => response.json())
            .then(data => {
                console.log('Fetch Room Data Success:', data);
                this.roomData = data;
        });
    }
  },

  loadLayerCache: async function () {
    await this.getCacheURI();
    vueComponents["loadCache"];
    // await loadCache(url);
    this.cacheLoaded = true;
  },

  waitForCache: function () {
    return new Promise((resolve) => {
       let waitForIt = () => {
           if (this.cacheLoaded) {
               resolve(true);
               return;
           }
           setTimeout(waitForIt, 10); // try again in 100 milliseconds            
        };
        waitForIt();
    })
  },

  waitForFetch: function () {
    return new Promise((resolve) => {
       let waitForIt = () => {
           if (window.SSO && window.SSO.userInfo) {
               resolve(true);
               return;
           }
           setTimeout(waitForIt, 10); // try again in 100 milliseconds            
        };
        waitForIt();
    })
  },

  waitForRoomId: function () {
    return new Promise((resolve) => {
       let waitForIt = () => {
           if (this.roomData) {
               resolve(true);
               return;
           }
           setTimeout(waitForIt, 10); // try again in 100 milliseconds            
        };
        waitForIt();
    })
  },

  getCacheURI: async function() {
    await this.waitForRoomId();
    
    let roomId = this.roomData.roomId;

    let room = roomId.toString();
    if (roomId < 0) {
        room = window.APP.hubChannel.hubId;
    }
    return room + '.cache';
  },

  getRoomURL: async function (number) {
    let hub_id = await this.getRoomHubId(number);

    if (number >= 0 && window.SSO.userInfo.rooms.length > number) {
          return "https://xr.realitymedia.digital/" + hub_id
       } else {
          return null;
       }
  },
  getRoomHubId: async function (number) {
    // need both the login info which has the local room list
    // and the room list fetched from the server
    await this.waitForFetch();
    await this.waitForRoomId();

    if (number >= 0 && window.SSO.userInfo.rooms.length > number) {
        if (this.roomData.roomId > 0 && this.roomData.localRooms.length > number) {
            return this.roomData.localRooms[number];
        } else {
            return window.SSO.userInfo.rooms[number];
        }
    } else {
        return ""
    }
  },
  getCubeMap: async function (number, waypoint) {
      await this.waitForFetch();

      if (!waypoint || waypoint.length == 0) {
          waypoint = "start";
      }
      let urls = ["Right","Left","Top","Bottom","Front","Back"].map(el => {
          return "https://resources.realitymedia.digital/data/roomPanos/" + number.toString() + "/" + waypoint + "-" + el + ".png"
      });
      return urls
      //return this.roomData.cubemaps.length > number ? this.roomData.cubemaps[number] : null;
  },
  getCubeMapByName: async function (name, waypoint) {
    if (!waypoint || waypoint.length == 0) {
        waypoint = "start";
    }
    let urls = ["Right","Left","Top","Bottom","Front","Back"].map(el => {
        return "https://resources.realitymedia.digital/data/roomPanos/" + name + "/" + waypoint + "-" + el + ".png"
    });
    return urls
    //return this.roomData.cubemaps.length > number ? this.roomData.cubemaps[number] : null;
  },

  goToURL: async function (url) {
    // first fade out
    await this.fader.fadeOut();
 
    // then hide completely
    const canvas = document.querySelector(".a-canvas");
    canvas.classList.add("a-hidden");

    window.location.href = url;
  },

  teleportTo: async function (object) {
    this.teleporting = true;
    await this.fader.fadeOut();
    // Scale screws up the waypoint logic, so just send position and orientation
    object.getWorldQuaternion(worldQuat);
    object.getWorldDirection(worldDir);
    object.getWorldPosition(worldPos);
    worldPos.add(worldDir.multiplyScalar(3)); // Teleport in front of the portal to avoid infinite loop
    mat4.makeRotationFromQuaternion(worldQuat);
    mat4.setPosition(worldPos);
    // Using the characterController ensures we don't stray from the navmesh
    this.characterController.travelByWaypoint(mat4, true, false);
    await this.fader.fadeIn();
    this.teleporting = false;
  },
});

window.APP.saveLayerCache = async function () {
    let system = window.APP.scene.systems.portal;
    let roomUri = await system.getCacheURI();

    const exportCache = vueComponents["exportCache"];
    let blob = await exportCache();
    downloadBlob(blob, roomUri);
};

AFRAME.registerComponent('portal', {
    schema: {
        portalType: { default: "" },
        portalTarget: { default: "" },
        secondaryTarget: { default: "" },
        color: { type: 'color', default: null },
        materialTarget: { type: 'string', default: null },
        drawDoor: { type: 'boolean', default: false },
        text: { type: 'string', default: null},
        textPosition: { type: 'vec3' },
        textSize: { type: 'vec2' },
        textScale: { type: 'number', default: 1 }
    },

    init: function () {
        // TESTING
        //this.data.drawDoor = true
        // this.data.mainText = "Portal to the Abyss"
        // this.data.secondaryText = "To visit the Abyss, go through the door!"

        // A-Frame is supposed to do this by default but doesn't seem to?
        this.system = window.APP.scene.systems.portal; 

        this.updatePortal = this.updatePortal.bind(this);

        if (this.data.portalType.length > 0 ) {
            this.setPortalInfo(this.data.portalType, this.data.portalTarget, this.data.color);
        } else {
            this.portalType = 0;
        }

        if (this.portalType == 0) {
            // parse the name to get portal type, target, and color
            this.parseNodeName();
        }
        
        this.portalTitle = null;

        // wait until the scene loads to finish.  We want to make sure everything
        // is initialized
        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        root && root.addEventListener("model-loaded", (ev) => { 
            this.initialize();
        }, once$1);
    },

    initialize: async function () {
        // this.material = new THREE.ShaderMaterial({
        //   transparent: true,
        //   side: THREE.DoubleSide,
        //   uniforms: {
        //     cubeMap: { value: new THREE.Texture() },
        //     time: { value: 0 },
        //     radius: { value: 0 },
        //     ringColor: { value: this.color },
        //   },
        //   vertexShader,
        //   fragmentShader: `
        //     ${snoise}
        //     ${fragmentShader}
        //   `,
        // })

        // Assume that the object has a plane geometry
        //const mesh = this.el.getOrCreateObject3D('mesh')
        //mesh.material = this.material

        this.materials = null;
        this.radius = 0.2;
        this.cubeMap = new THREE.CubeTexture();

        // get the other before continuing
        this.other = await this.getOther();

        this.el.setAttribute('animation__portal', {
            property: 'components.portal.radius',
            dur: 700,
            easing: 'easeInOutCubic',
        });
        
        // this.el.addEventListener('animationbegin', () => (this.el.object3D.visible = true))
        // this.el.addEventListener('animationcomplete__portal', () => (this.el.object3D.visible = !this.isClosed()))

        // going to want to try and make the object this portal is on clickable
        // this.el.setAttribute('is-remote-hover-target','')
        // this.el.setAttribute('tags', {singleActionButton: true})
        //this.el.setAttribute('class', "interactable")
        // orward the 'interact' events to our portal movement 
        //this.followPortal = this.followPortal.bind(this)
        //this.el.object3D.addEventListener('interact', this.followPortal)

        if ( this.el.components["media-loader"] || this.el.components["media-image"] ) {
            if (this.el.components["media-loader"]) {
                let fn = () => {
                    this.setupPortal();
                    if (this.data.drawDoor) {
                        this.setupDoor();
                    }
                    this.el.removeEventListener('media-loaded', fn);
                 };
                this.el.addEventListener("media-loaded", fn);
            } else {
                this.setupPortal();
                if (this.data.drawDoor) {
                    this.setupDoor();
                }
            }
        } else {
            this.setupPortal();
            if (this.data.drawDoor) {
                this.setupDoor();
            }
        }
    },

    updatePortal: async function () {
        // no-op for portals that use pre-rendered cube maps
        if (this.portalType == 2 || this.portalType == 3) { 
            //this.el.sceneEl.addEventListener('model-loaded', () => {
                showRegionForObject(this.el);
                this.cubeCamera.update(this.el.sceneEl.renderer, this.el.sceneEl.object3D);
                // this.cubeCamera.renderTarget.texture.generateMipmaps = true
                // this.cubeCamera.renderTarget.texture.needsUpdate = true
                hiderRegionForObject(this.el);
            //}, once)
        }
    },

    setupPortal: async function () {
        // get rid of interactivity
        if (this.el.classList.contains("interactable")) {
            this.el.classList.remove("interactable");
        }
        this.el.removeAttribute("is-remote-hover-target");
        
        let target = this.data.materialTarget;
        if (target && target.length == 0) {target=null;}
    
        this.materials = updateWithShader(WarpPortalShader, this.el, target, {
            radius: this.radius,
            ringColor: this.color,
            cubeMap: this.cubeMap,
            invertWarpColor: this.portalType == 1 ? 1 : 0
        });

        if (this.portalType == 1 && this.portalTarget != null) {
            this.system.getCubeMap(this.portalTarget, this.data.secondaryTarget).then( urls => {
                //const urls = [cubeMapPosX, cubeMapNegX, cubeMapPosY, cubeMapNegY, cubeMapPosZ, cubeMapNegZ];
                new Promise((resolve, reject) =>
                  new THREE.CubeTextureLoader().load(urls, resolve, undefined, reject)
                ).then(texture => {
                    texture.format = THREE.RGBFormat;
                    //this.material.uniforms.cubeMap.value = texture;
                    //this.materials.map((mat) => {mat.userData.cubeMap = texture;})
                    this.cubeMap = texture;
                }).catch(e => console.error(e));    
            });
        } else if (this.portalType == 4) {
            this.system.getCubeMapByName(this.portalTarget, this.data.secondaryTarget).then( urls => {
                //const urls = [cubeMapPosX, cubeMapNegX, cubeMapPosY, cubeMapNegY, cubeMapPosZ, cubeMapNegZ];
                new Promise((resolve, reject) =>
                    new THREE.CubeTextureLoader().load(urls, resolve, undefined, reject)
                ).then(texture => {
                    texture.format = THREE.RGBFormat;
                    //this.material.uniforms.cubeMap.value = texture;
                    //this.materials.map((mat) => {mat.userData.cubeMap = texture;})
                    this.cubeMap = texture;
                }).catch(e => console.error(e));    
            });
        } else if (this.portalType == 2 || this.portalType == 3) { 
            if (THREE.REVISION < 125) {   
                this.cubeCamera = new CubeCameraWriter(0.1, 1000, 1024);
            } else {
                const cubeRenderTarget = new THREE.WebGLCubeRenderTarget( 1024, { encoding: THREE.sRGBEncoding, generateMipmaps: true } );
                this.cubeCamera = new CubeCameraWriter(1, 100000, cubeRenderTarget);
            }

            //this.cubeCamera.rotateY(Math.PI) // Face forwards
            if (this.portalType == 2) {
                this.el.object3D.add(this.cubeCamera);
                // this.other.components.portal.material.uniforms.cubeMap.value = this.cubeCamera.renderTarget.texture 
                //this.other.components.portal.materials.map((mat) => {mat.userData.cubeMap = this.cubeCamera.renderTarget.texture;})
                this.other.components.portal.cubeMap = this.cubeCamera.renderTarget.texture;
            } else {
                let waypoint = document.getElementsByClassName(this.portalTarget);
                if (waypoint.length > 0) {
                    waypoint = waypoint.item(0);
                    this.cubeCamera.position.y = 1.6;
                    this.cubeCamera.needsUpdate = true;
                    waypoint.object3D.add(this.cubeCamera);
                    // this.material.uniforms.cubeMap.value = this.cubeCamera.renderTarget.texture;
                    //this.materials.map((mat) => {mat.userData.cubeMap = this.cubeCamera.renderTarget.texture;})
                    this.cubeMap = this.cubeCamera.renderTarget.texture;
                }
            }
            this.updatePortal();
            this.el.sceneEl.addEventListener('updatePortals', this.updatePortal);
            this.el.sceneEl.addEventListener('model-loaded', this.updatePortal);
            this.el.sceneEl.addEventListener('media-loaded', this.updatePortal);
        }

        let rot = new THREE.Quaternion();
        let scaleW = new THREE.Vector3();
        let pos = new THREE.Vector3();
        this.el.object3D.matrixWorld.decompose(pos, rot, scaleW);
        let scaleM = this.el.object3DMap["mesh"].scale;

        // let scaleX = scaleM.x * scaleI.x
        // let scaleY = scaleM.y * scaleI.y
        // let scaleZ = scaleM.z * scaleI.z

        // this.portalWidth = scaleX / 2
        // this.portalHeight = scaleY / 2

        // offset to center of portal assuming walking on ground
        // this.Yoffset = -(this.el.object3D.position.y - 1.6)
        this.Yoffset = -((scaleW.y * scaleM.y)/2 - 1.6);
        
        this.close();
        this.el.setAttribute('proximity-events', { radius: 4, Yoffset: this.Yoffset });
        this.el.addEventListener('proximityenter', () => this.open());
        this.el.addEventListener('proximityleave', () => this.close());

        this.el.setObject3D.matrixAutoUpdate = true;
    
        if (this.data.text && this.data.text.length > 0) {
            var titleScriptData = {
                width: this.data.textSize.x,
                height: this.data.textSize.y,
                message: this.data.text
            };

            // don't want to proceed until the cache is loaded
            //await this.system.waitForCache();

            const portalTitle = vueComponents["PortalTitle"];
            // const portalSubtitle = htmlComponents["PortalSubtitle"]

            this.portalTitle = portalTitle(titleScriptData);
            // this.portalSubtitle = portalSubtitle(subtitleScriptData)

            this.portalTitle.waitForReady().then(() => {
                this.el.setObject3D('portalTitle', this.portalTitle.webLayer3D);
                this.portalTitle.webLayer3D.matrixAutoUpdate = true;

                let size = this.portalTitle.getSize();
                let titleScaleX = (scaleW.x) / this.data.textScale;
                let titleScaleY = (scaleW.y) / this.data.textScale;
                let titleScaleZ = (scaleW.z) / this.data.textScale;

                this.portalTitle.webLayer3D.scale.x /= titleScaleX;
                this.portalTitle.webLayer3D.scale.y /= titleScaleY;
                this.portalTitle.webLayer3D.scale.z /= titleScaleZ;

                this.portalTitle.webLayer3D.position.x = 
                        this.data.textPosition.x / (scaleW.x);
                this.portalTitle.webLayer3D.position.y = 
                        (0.5 * scaleM.y) +
                        (this.data.drawDoor ? 0.105 : 0) / (scaleW.y) +
                        ((size.height * this.data.textScale) /2) / (scaleW.y) + 
                        this.data.textPosition.y / (scaleW.y);
                this.portalTitle.webLayer3D.position.z = 
                        this.data.textPosition.z / (scaleW.z);
                // this.el.setObject3D('portalSubtitle', this.portalSubtitle.webLayer3D)
            // this.portalSubtitle.webLayer3D.position.x = 1
            });
            // this.portalSubtitle.webLayer3D.matrixAutoUpdate = true
        }
        // this.materials.map((mat) => {
        //     mat.userData.radius = this.radius
        //     mat.userData.ringColor = this.color
        //     mat.userData.cubeMap = this.cubeMap
        // })
    },

    remove: function () {
        this.el.sceneEl.removeEventListener('updatePortals', this.updatePortal);
        this.el.sceneEl.removeEventListener('model-loaded', this.updatePortal);
        this.el.sceneEl.removeEventListener('media-loaded', this.updatePortal);

        if (this.portalTitle) {
            this.el.removeObject3D("portalTitle");

            this.portalTitle.destroy();
            this.portalTitle = null;
        }
        if (this.cubeMap) {
            this.cubeMap.dispose();
            this.cubeMap = null;
        } 
    },

        //   replaceMaterial: function (newMaterial) {
//     let target = this.data.materialTarget
//     if (target && target.length == 0) {target=null}
    
//     let traverse = (object) => {
//       let mesh = object
//       if (mesh.material) {
//           mapMaterials(mesh, (material) => {         
//               if (!target || material.name === target) {
//                   mesh.material = newMaterial
//               }
//           })
//       }
//       const children = object.children;
//       for (let i = 0; i < children.length; i++) {
//           traverse(children[i]);
//       }
//     }

//     let replaceMaterials = () => {
//         // mesh would contain the object that is, or contains, the meshes
//         var mesh = this.el.object3DMap.mesh
//         if (!mesh) {
//             // if no mesh, we'll search through all of the children.  This would
//             // happen if we dropped the component on a glb in spoke
//             mesh = this.el.object3D
//         }
//         traverse(mesh);
//        // this.el.removeEventListener("model-loaded", initializer);
//     }

//     // let root = findAncestorWithComponent(this.el, "gltf-model-plus")
//     // let initializer = () =>{
//       if (this.el.components["media-loader"]) {
//           this.el.addEventListener("media-loaded", replaceMaterials)
//       } else {
//           replaceMaterials()
//       }
//     // };
//     //replaceMaterials()
//     // root.addEventListener("model-loaded", initializer);
//   },

//   followPortal: function() {
//     if (this.portalType == 1) {
//         console.log("set window.location.href to " + this.other)
//         window.location.href = this.other
//       } else if (this.portalType == 2) {
//         this.system.teleportTo(this.other.object3D)
//       }
//   },

    setupDoor: function() {
        // attached to an image in spoke.  This is the only way we allow buidling a 
        // door around it
        let scaleM = this.el.object3DMap["mesh"].scale;
        let rot = new THREE.Quaternion();
        let scaleW = new THREE.Vector3();
        let pos = new THREE.Vector3();
        this.el.object3D.matrixWorld.decompose(pos, rot, scaleW);

        var width = scaleW.x * scaleM.x;
        var height = scaleW.y * scaleM.y;
        var depth = scaleW.z * scaleM.z;
        
        // let scaleI = this.el.object3D.scale
        // var width = scaleM.x * scaleI.x
        // var height = scaleM.y * scaleI.y
        // var depth = 1.0; //  scaleM.z * scaleI.z
        const environmentMapComponent = this.el.sceneEl.components["environment-map"];

        // let above = new THREE.Mesh(
        //     new THREE.SphereGeometry(1, 50, 50),
        //     doormaterialY 
        // );
        // if (environmentMapComponent) {
        //     environmentMapComponent.applyEnvironmentMap(above);
        // }
        // above.position.set(0, 2.5, 0)
        // this.el.object3D.add(above)

        let left = new THREE.Mesh(
            // new THREE.BoxGeometry(0.1/width,2/height,0.1/depth,2,5,2),
            new THREE.BoxGeometry(0.1/width,1,0.099/depth,2,5,2),
            [doorMaterial,doorMaterial,doormaterialY, doormaterialY,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(left);
        }
        left.position.set(-0.51, 0, 0);
        this.el.object3D.add(left);

        let right = new THREE.Mesh(
            new THREE.BoxGeometry(0.1/width,1,0.099/depth,2,5,2),
            [doorMaterial,doorMaterial,doormaterialY, doormaterialY,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(right);
        }
        right.position.set(0.51, 0, 0);
        this.el.object3D.add(right);

        let top = new THREE.Mesh(
            new THREE.BoxGeometry(1 + 0.3/width,0.1/height,0.1/depth,2,5,2),
            [doormaterialY,doormaterialY,doorMaterial,doorMaterial,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(top);
        }
        top.position.set(0.0, 0.505, 0);
        this.el.object3D.add(top);

        // if (width > 0 && height > 0) {
        //     const {width: wsize, height: hsize} = this.script.getSize()
        //     var scale = Math.min(width / wsize, height / hsize)
        //     this.simpleContainer.setAttribute("scale", { x: scale, y: scale, z: scale});
        // }
    },

    // hideRoom: function() {
    //     const canvas = document.querySelector(".a-canvas");
    //     canvas.classList.add("a-hidden");
    // },      
    tick: function (time) {
        //this.material.uniforms.time.value = time / 1000
        if (!this.materials) { return }

        if (this.portalTitle) {
            this.portalTitle.tick(time);
            // this.portalSubtitle.tick(time)
        }

        this.materials.map((mat) => {
            mat.userData.radius = this.radius;
            mat.userData.cubeMap = this.cubeMap;
            WarpPortalShader.updateUniforms(time, mat);
        });

        if (this.other && !this.system.teleporting) {
        //   this.el.object3D.getWorldPosition(worldPos)
        //   this.el.sceneEl.camera.getWorldPosition(worldCameraPos)
        //   worldCameraPos.y -= this.Yoffset
        //   const dist = worldCameraPos.distanceTo(worldPos)
          this.el.sceneEl.camera.getWorldPosition(worldCameraPos$1);
          this.el.object3D.worldToLocal(worldCameraPos$1);

          // in local portal coordinates, the width and height are 1
          if (Math.abs(worldCameraPos$1.x) > 0.5 || Math.abs(worldCameraPos$1.y) > 0.5) {
            return;
          }
          const dist = Math.abs(worldCameraPos$1.z);

          // window.APP.utils.changeToHub
          if ((this.portalType == 1 || this.portalType == 4) && dist < 0.25) {
              if (!this.locationhref) {
                this.locationhref = this.other;
                if (!APP.store.state.preferences.fastRoomSwitching) {
                    console.log("set window.location.href to " + this.other);
                    //this.hideRoom();
                    //window.location.href = this.other;
                    this.system.goToURL(this.other);
                } else {
                    let wayPoint = this.data.secondaryTarget;
                    document.querySelector("#environment-scene");
                    let goToWayPoint = function() {
                        if (wayPoint && wayPoint.length > 0) {
                            console.log("FAST ROOM SWITCH INCLUDES waypoint: setting hash to " + wayPoint);
                            window.location.hash = wayPoint;
                        }
                    };
                    console.log("FAST ROOM SWITCH. going to " + this.hub_id);
                    if (this.hubId === APP.hub.hub_id) {
                        console.log("Same Room");
                        goToWayPoint();
                    } else {
                        window.changeHub(this.hub_id).then(() => {
                            // environmentScene.addEventListener("model-loaded", () => {
                            //     console.log("Environment scene has loaded");
                                goToWayPoint();
                            // })
                        });
                    }
                }
            }
          } else if (this.portalType == 2 && dist < 0.25) {
            this.system.teleportTo(this.other.object3D);
          } else if (this.portalType == 3) {
              if (dist < 0.25) {
                if (!this.locationhref) {
                  console.log("set window.location.hash to " + this.other);
                  this.locationhref = this.other;
                  window.location.hash = this.other;
                }
              } else {
                  // if we set locationhref, we teleported.  when it
                  // finally happens, and we move outside the range of the portal,
                  // we will clear the flag
                  this.locationhref = null;
              }
          }
        }
      },

    getOther: function () {
        return new Promise((resolve) => {
            if (this.portalType == 0) {
                resolve(null);
            } else if (this.portalType  == 1) {
                // first wait for the hub_id
                if (this.portalTarget != null) {
                    this.system.getRoomHubId(this.portalTarget).then(hub_id => {
                        this.hub_id = hub_id;
                
                        // the target is another room, resolve with the URL to the room
                        this.system.getRoomURL(this.portalTarget).then(url => { 
                            if (!url) {
                                resolve(null);
                                return
                            }

                            if (this.data.secondaryTarget && this.data.secondaryTarget.length > 0) {
                                resolve(url + "#" + this.data.secondaryTarget);
                            } else {
                                resolve(url); 
                            }
                        });
                    });
                } else {
                    resolve(null);
                }
            } else if (this.portalType == 2) {
                  // now find the portal within the room.  The portals should come in pairs with the same portalTarget
                const portals = Array.from(document.querySelectorAll(`[portal]`));
                const other = portals.find((el) => el.components.portal.portalType == this.portalType &&
                            el.components.portal.portalTarget === this.portalTarget && 
                            el !== this.el);
                if (other !== undefined) {
                    // Case 1: The other portal already exists
                    resolve(other);
                    other.emit('pair', { other: this.el }); // Let the other know that we're ready
                } else {
                    // Case 2: We couldn't find the other portal, wait for it to signal that it's ready
                    this.el.addEventListener('pair', (event) => { 
                        resolve(event.detail.other);
                    }, { once: true });
                }
            } else if (this.portalType == 3) {
                resolve ("#" + this.portalTarget);
            } else if (this.portalType == 4) {
                let url = window.location.origin + "/" + this.portalTarget;
                this.hub_id = this.portalTarget;
                if (this.data.secondaryTarget && this.data.secondaryTarget.length > 0) {
                    resolve(url + "#" + this.data.secondaryTarget);
                } else {
                    resolve(url); 
                }
            }
        })
    },

    parseNodeName: function () {
        const nodeName = this.el.parentEl.parentEl.className;

        // nodes should be named anything at the beginning with either 
        // - "room_name_color"
        // - "portal_N_color" 
        // at the very end. Numbered portals should come in pairs.
        const params = nodeName.match(/([A-Za-z]*)_([A-Za-z0-9]*)_([A-Za-z0-9]*)$/);
        
        // if pattern matches, we will have length of 4, first match is the portal type,
        // second is the name or number, and last is the color
        if (!params || params.length < 4) {
            console.warn("portal node name not formed correctly: ", nodeName);
            this.portalType = 0;
            this.portalTarget = null;
            this.color = "red"; // default so the portal has a color to use
            return;
        } 
        this.setPortalInfo(params[1], params[2], params[3]);
    },

    setPortalInfo: function(portalType, portalTarget, color) {
        if (portalType === "room") {
            this.portalType = 1;
            if (portalTarget.length > 0) {
                this.portalTarget = parseInt(portalTarget);
            } else {
                this.portalTarget = null;
            }
        } else if (portalType === "portal") {
            this.portalType = 2;
            this.portalTarget = portalTarget;
        } else if (portalType === "waypoint") {
            this.portalType = 3;
            this.portalTarget = portalTarget;
        } else if (portalType === "roomName") {
            this.portalType = 4;
            this.portalTarget = portalTarget;
        } else {    
            this.portalType = 0;
            this.portalTarget = null;
        } 
        this.color = new THREE.Color(color);
    },

    setRadius(val) {
        this.el.setAttribute('animation__portal', {
        //   from: this.material.uniforms.radius.value,
            from: this.radius,
            to: val,
        });
    },
    open() {
        this.setRadius(1);
    },
    close() {
        this.setRadius(0.2);
    },
    isClosed() {
        // return this.material.uniforms.radius.value === 0
        return this.radius === 0.2
    },
});

var ballfx = "https://williamcaseylucas.github.io/core-components/e1702ea21afb4a86.png";

const glsl$2 = `
varying vec2 ballvUv;
varying vec3 ballvPosition;
varying vec3 ballvNormal;
varying vec3 ballvWorldPos;
uniform float ballTime;
uniform float selected;

mat4 ballinverse(mat4 m) {
  float
      a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3],
      a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3],
      a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3],
      a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3],

      b00 = a00 * a11 - a01 * a10,
      b01 = a00 * a12 - a02 * a10,
      b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11,
      b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30,
      b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31,
      b10 = a21 * a33 - a23 * a31,
      b11 = a22 * a33 - a23 * a32,

      det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  return mat4(
      a11 * b11 - a12 * b10 + a13 * b09,
      a02 * b10 - a01 * b11 - a03 * b09,
      a31 * b05 - a32 * b04 + a33 * b03,
      a22 * b04 - a21 * b05 - a23 * b03,
      a12 * b08 - a10 * b11 - a13 * b07,
      a00 * b11 - a02 * b08 + a03 * b07,
      a32 * b02 - a30 * b05 - a33 * b01,
      a20 * b05 - a22 * b02 + a23 * b01,
      a10 * b10 - a11 * b08 + a13 * b06,
      a01 * b08 - a00 * b10 - a03 * b06,
      a30 * b04 - a31 * b02 + a33 * b00,
      a21 * b02 - a20 * b04 - a23 * b00,
      a11 * b07 - a10 * b09 - a12 * b06,
      a00 * b09 - a01 * b07 + a02 * b06,
      a31 * b01 - a30 * b03 - a32 * b00,
      a20 * b03 - a21 * b01 + a22 * b00) / det;
}


mat4 balltranspose(in mat4 m) {
  vec4 i0 = m[0];
  vec4 i1 = m[1];
  vec4 i2 = m[2];
  vec4 i3 = m[3];

  return mat4(
    vec4(i0.x, i1.x, i2.x, i3.x),
    vec4(i0.y, i1.y, i2.y, i3.y),
    vec4(i0.z, i1.z, i2.z, i3.z),
    vec4(i0.w, i1.w, i2.w, i3.w)
  );
}

void main()
{
  ballvUv = uv;

  ballvPosition = position;

  vec3 offset = vec3(
    sin(position.x * 50.0 + ballTime),
    sin(position.y * 10.0 + ballTime * 2.0),
    cos(position.z * 40.0 + ballTime)
  ) * 0.003;

   ballvPosition *= 1.0 + selected * 0.2;

   ballvNormal = normalize(ballinverse(balltranspose(modelMatrix)) * vec4(normalize(normal), 1.0)).xyz;
   ballvWorldPos = (modelMatrix * vec4(ballvPosition, 1.0)).xyz;

   vec4 ballvPosition = modelViewMatrix * vec4(ballvPosition + offset, 1.0);

  gl_Position = projectionMatrix * ballvPosition;
}
`;

const glsl$1 = `
uniform sampler2D panotex;
uniform sampler2D texfx;
uniform float ballTime;
uniform float selected;
varying vec2 ballvUv;
varying vec3 ballvPosition;
varying vec3 ballvNormal;
varying vec3 ballvWorldPos;

uniform float opacity;

void main( void ) {
   vec2 uv = ballvUv;
  //uv.y =  1.0 - uv.y;

   vec3 eye = normalize(cameraPosition - ballvWorldPos);
   float fresnel = abs(dot(eye, ballvNormal));
   float shift = pow((1.0 - fresnel), 4.0) * 0.05;

  vec3 col = vec3(
    texture2D(panotex, uv - shift).r,
    texture2D(panotex, uv).g,
    texture2D(panotex, uv + shift).b
  );

   col = mix(col * 0.7, vec3(1.0), 0.7 - fresnel);

   col += selected * 0.3;

   float t = ballTime * 0.4 + ballvPosition.x + ballvPosition.z;
   uv = vec2(ballvUv.x + t * 0.2, ballvUv.y + t);
   vec3 fx = texture2D(texfx, uv).rgb * 0.4;

  //vec4 col = vec4(1.0, 1.0, 0.0, 1.0);
  gl_FragColor = vec4(col + fx, opacity);
  //gl_FragColor = vec4(col + fx, 1.0);
}
`;

/**
 * Description
 * ===========
 * 360 image that fills the user's vision when in a close proximity.
 *
 * Usage
 * =======
 * Given a 360 image asset with the following URL in Spoke:
 * https://gt-ael-aq-assets.aelatgt-internal.net/files/12345abc-6789def.jpg
 *
 * The name of the `immersive-360.glb` instance in the scene should be:
 * "some-descriptive-label__12345abc-6789def_jpg" OR "12345abc-6789def_jpg"
 */

const worldCamera = new THREE.Vector3();
const worldSelf = new THREE.Vector3();

const loader$1 = new THREE.TextureLoader();
var ballTex = null;
loader$1.load(ballfx, (ball) => {
    ball.minFilter = THREE.NearestFilter;
    ball.magFilter = THREE.NearestFilter;
    ball.wrapS = THREE.RepeatWrapping;
    ball.wrapT = THREE.RepeatWrapping;
    ballTex = ball;
});

// simple hack to get position of pano media aligned with camera.
// Systems are updated after components, so we do the final alignment
// with the camera after all the components are updated.
AFRAME.registerSystem('immersive-360', {
  init: function () {
    this.updateThis = null;
  },
  updatePosition(component) {
    // TODO:  add this to a queue, and process the queue in tick()
    this.updateThis = component;
  },

  tick: function () {
    // TODO: process the queue, popping everything off the queue when we are done
    if (this.updateThis) {
      if (window.APP.scene.is("vr-mode")) {
        this.updateThis.mesh.position.set(0,0,0);
        let radius = this.updateThis.data.radius;
        this.updateThis.mesh.scale.set(10+radius,10+radius,10+radius);
      } else {
        ///let cam = document.getElementById("viewing-camera").object3DMap.camera;
        this.updateThis.el.sceneEl.camera.updateMatrices();
        this.updateThis.el.sceneEl.camera.getWorldPosition(worldCamera);
        this.updateThis.el.object3D.worldToLocal(worldCamera);
        this.updateThis.mesh.position.copy(worldCamera);
        this.updateThis.mesh.scale.set(1,1,1);
      }
      this.updateThis.mesh.matrixNeedsUpdate = true;
      this.updateThis.mesh.updateWorldMatrix(true, false);

      this.updateThis = null;
    }
  },

});
AFRAME.registerComponent('immersive-360', {
  schema: {
    url: { type: 'string', default: null },
    radius: { type: 'number', default: 0.15 },
  },

  init: async function () {
    this.system = window.APP.scene.systems['immersive-360'];

    var url = this.data.url;
    if (!url || url == "") {
        url = this.parseSpokeName();
    }
    
    const extension = url.match(/^.*\.(.*)$/)[1];

    // set up the local content and hook it to the scene
    this.pano = document.createElement('a-entity');
    // media-image will set up the sphere geometry for us
    this.pano.setAttribute('media-image', {
      projection: '360-equirectangular',
      alphaMode: 'opaque',
      src: url,
      version: 1,
      batch: false,
      contentType: `image/${extension}`,
      alphaCutoff: 0,
    });
   // this.pano.object3D.position.y = 1.6
    this.el.appendChild(this.pano);

    // but we need to wait for this to happen
    this.mesh = await this.getMesh();
    this.mesh.matrixAutoUpdate = true;
    this.mesh.updateWorldMatrix(true, false);

    var ball = new THREE.Mesh(
        new THREE.SphereBufferGeometry(this.data.radius, 30, 20),
        new THREE.ShaderMaterial({
            uniforms: {
              panotex: {value: this.mesh.material.map},
              texfx: {value: ballTex},
              selected: {value: 0},
              ballTime: {value: 0}
            },
            vertexShader: glsl$2,
            fragmentShader: glsl$1,
            side: THREE.BackSide,
          })
    );
   
    // get the pano oriented properly in the room relative to the way media-image is oriented
    ball.rotation.set(Math.PI, Math.PI, 0);

    ball.userData.floatY = (this.data.radius > 1.5 ? this.data.radius + 0.1 : 1.6);
    ball.userData.selected = 0;
    ball.userData.timeOffset = (Math.random()+0.5) * 10;
    this.ball = ball;
    this.el.setObject3D("ball", ball);

    //this.mesh.geometry.scale(2, 2, 2)
    this.mesh.material.setValues({
      transparent: true,
      depthTest: false,
    });
    this.mesh.visible = false;
    
    this.near = this.data.radius - 0;
    this.far = this.data.radius + 0.05;

    // Render OVER the scene but UNDER the cursor
    this.mesh.renderOrder = APP.RENDER_ORDER.CURSOR - 0.1;
  },
  remove: function() {
    this.ball.geometry.dispose();
    this.ball.geometry = null;
    this.ball.material.dispose();
    this.ball.material = null;
    this.el.removeObject3D("ball");
    this.ball = null;
  },
  tick: function (time) {
    if (this.mesh && ballTex) {
      let offset = Math.cos((time + this.ball.userData.timeOffset)/1000 * 3 ) * 0.02;
      this.ball.position.y = this.ball.userData.floatY + offset;
      this.ball.matrixNeedsUpdate = true;

      this.ball.material.uniforms.texfx.value = ballTex;
      this.ball.material.uniforms.ballTime.value = time * 0.001 + this.ball.userData.timeOffset;
      // Linearly map camera distance to material opacity
      this.ball.getWorldPosition(worldSelf);
      this.el.sceneEl.camera.getWorldPosition(worldCamera);
      const distance = worldSelf.distanceTo(worldCamera);
      const opacity = 1 - (distance - this.near) / (this.far - this.near);
      if (opacity < 0) {
          // far away
          this.mesh.visible = false;
          this.mesh.material.opacity = 1;
          this.ball.material.opacity = 1;
        } else {
          this.mesh.material.opacity = opacity > 1 ? 1 : opacity;
          this.mesh.visible = true;
          this.ball.material.opacity = this.mesh.material.opacity;
          
          // position the mesh around user until they leave the ball
          // this.el.object3D.worldToLocal(worldCamera)
          // this.mesh.position.copy(worldCamera)
          
          // this.el.object3D.getWorldPosition(worldSelf)
          // worldSelf.y += this.ball.userData.floatY;

          // worldSelf.sub(worldCamera)
          // this.mesh.position.copy(worldSelf)
          this.system.updatePosition(this);
        }
    }
  },
  parseSpokeName: function () {
    // Accepted names: "label__image-hash_ext" OR "image-hash_ext"
    const spokeName = this.el.parentEl.parentEl.className;
    const matches = spokeName.match(/(?:.*__)?(.*)_(.*)/);
    if (!matches || matches.length < 3) { return "" }
    const [, hash, extension]  = matches;
    const url = `https://resources.realitymedia.digital/data/${hash}.${extension}`;
    return url
  },
  getMesh: async function () {
    return new Promise((resolve) => {
      const mesh = this.pano.object3DMap.mesh;
      if (mesh) resolve(mesh);
      this.pano.addEventListener(
        'image-loaded',
        () => {
            console.log("immersive-360 pano loaded: " + this.data.url);
          resolve(this.pano.object3DMap.mesh);
        },
        { once: true }
      );
    })
  },
});

// Parallax Occlusion shaders from
//    http://sunandblackcat.com/tipFullView.php?topicid=28
// No tangent-space transforms logic based on
//   http://mmikkelsen3d.blogspot.sk/2012/02/parallaxpoc-mapping-and-no-tangent.html

// Identity function for glsl-literal highlighting in VS Code
const glsl = String.raw;

const ParallaxShader = {
  // Ordered from fastest to best quality.
  modes: {
    none: 'NO_PARALLAX',
    basic: 'USE_BASIC_PARALLAX',
    steep: 'USE_STEEP_PARALLAX',
    occlusion: 'USE_OCLUSION_PARALLAX', // a.k.a. POM
    relief: 'USE_RELIEF_PARALLAX',
  },

  uniforms: {
    bumpMap: { value: null },
    map: { value: null },
    parallaxScale: { value: null },
    parallaxMinLayers: { value: null },
    parallaxMaxLayers: { value: null },
  },

  vertexShader: glsl`
    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;

    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
      vViewPosition = -mvPosition.xyz;
      vNormal = normalize( normalMatrix * normal );
      
      gl_Position = projectionMatrix * mvPosition;
    }
  `,

  fragmentShader: glsl`
    uniform sampler2D bumpMap;
    uniform sampler2D map;

    uniform float parallaxScale;
    uniform float parallaxMinLayers;
    uniform float parallaxMaxLayers;
    uniform float fade; // CUSTOM

    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;

    #ifdef USE_BASIC_PARALLAX

    vec2 parallaxMap(in vec3 V) {
      float initialHeight = texture2D(bumpMap, vUv).r;

      // No Offset Limitting: messy, floating output at grazing angles.
      //"vec2 texCoordOffset = parallaxScale * V.xy / V.z * initialHeight;",

      // Offset Limiting
      vec2 texCoordOffset = parallaxScale * V.xy * initialHeight;
      return vUv - texCoordOffset;
    }

    #else

    vec2 parallaxMap(in vec3 V) {
      // Determine number of layers from angle between V and N
      float numLayers = mix(parallaxMaxLayers, parallaxMinLayers, abs(dot(vec3(0.0, 0.0, 1.0), V)));

      float layerHeight = 1.0 / numLayers;
      float currentLayerHeight = 0.0;
      // Shift of texture coordinates for each iteration
      vec2 dtex = parallaxScale * V.xy / V.z / numLayers;

      vec2 currentTextureCoords = vUv;

      float heightFromTexture = texture2D(bumpMap, currentTextureCoords).r;

      // while ( heightFromTexture > currentLayerHeight )
      // Infinite loops are not well supported. Do a "large" finite
      // loop, but not too large, as it slows down some compilers.
      for (int i = 0; i < 30; i += 1) {
        if (heightFromTexture <= currentLayerHeight) {
          break;
        }
        currentLayerHeight += layerHeight;
        // Shift texture coordinates along vector V
        currentTextureCoords -= dtex;
        heightFromTexture = texture2D(bumpMap, currentTextureCoords).r;
      }

      #ifdef USE_STEEP_PARALLAX

      return currentTextureCoords;

      #elif defined(USE_RELIEF_PARALLAX)

      vec2 deltaTexCoord = dtex / 2.0;
      float deltaHeight = layerHeight / 2.0;

      // Return to the mid point of previous layer
      currentTextureCoords += deltaTexCoord;
      currentLayerHeight -= deltaHeight;

      // Binary search to increase precision of Steep Parallax Mapping
      const int numSearches = 5;
      for (int i = 0; i < numSearches; i += 1) {
        deltaTexCoord /= 2.0;
        deltaHeight /= 2.0;
        heightFromTexture = texture2D(bumpMap, currentTextureCoords).r;
        // Shift along or against vector V
        if (heightFromTexture > currentLayerHeight) {
          // Below the surface

          currentTextureCoords -= deltaTexCoord;
          currentLayerHeight += deltaHeight;
        } else {
          // above the surface

          currentTextureCoords += deltaTexCoord;
          currentLayerHeight -= deltaHeight;
        }
      }
      return currentTextureCoords;

      #elif defined(USE_OCLUSION_PARALLAX)

      vec2 prevTCoords = currentTextureCoords + dtex;

      // Heights for linear interpolation
      float nextH = heightFromTexture - currentLayerHeight;
      float prevH = texture2D(bumpMap, prevTCoords).r - currentLayerHeight + layerHeight;

      // Proportions for linear interpolation
      float weight = nextH / (nextH - prevH);

      // Interpolation of texture coordinates
      return prevTCoords * weight + currentTextureCoords * (1.0 - weight);

      #else // NO_PARALLAX

      return vUv;

      #endif
    }
    #endif

    vec2 perturbUv(vec3 surfPosition, vec3 surfNormal, vec3 viewPosition) {
      vec2 texDx = dFdx(vUv);
      vec2 texDy = dFdy(vUv);

      vec3 vSigmaX = dFdx(surfPosition);
      vec3 vSigmaY = dFdy(surfPosition);
      vec3 vR1 = cross(vSigmaY, surfNormal);
      vec3 vR2 = cross(surfNormal, vSigmaX);
      float fDet = dot(vSigmaX, vR1);

      vec2 vProjVscr = (1.0 / fDet) * vec2(dot(vR1, viewPosition), dot(vR2, viewPosition));
      vec3 vProjVtex;
      vProjVtex.xy = texDx * vProjVscr.x + texDy * vProjVscr.y;
      vProjVtex.z = dot(surfNormal, viewPosition);

      return parallaxMap(vProjVtex);
    }

    void main() {
      vec2 mapUv = perturbUv(-vViewPosition, normalize(vNormal), normalize(vViewPosition));
      
      // CUSTOM START
      vec4 texel = texture2D(map, mapUv);
      vec3 color = mix(texel.xyz, vec3(0), fade);
      gl_FragColor = vec4(color, 1.0);
      // CUSTOM END
    }

  `,
};

/**
 * Description
 * ===========
 * Create the illusion of depth in a color image from a depth map
 *
 * Usage
 * =====
 * Create a plane in Blender and give it a material (just the default Principled BSDF).
 * Assign color image to "color" channel and depth map to "emissive" channel.
 * You may want to set emissive strength to zero so the preview looks better.
 * Add the "parallax" component from the Hubs extension, configure, and export as .glb
 */

const vec = new THREE.Vector3();
const forward = new THREE.Vector3(0, 0, 1);

AFRAME.registerComponent('parallax', {
  schema: {
    strength: { type: 'number', default: 0.5 },
    cutoffTransition: { type: 'number', default: Math.PI / 8 },
    cutoffAngle: { type: 'number', default: Math.PI / 4 },
  },
  init: function () {
    const mesh = this.el.object3DMap.mesh;
    const { map: colorMap, emissiveMap: depthMap } = mesh.material;
    colorMap.wrapS = colorMap.wrapT = THREE.ClampToEdgeWrapping;
    depthMap.wrapS = depthMap.wrapT = THREE.ClampToEdgeWrapping;
    const { vertexShader, fragmentShader } = ParallaxShader;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: { USE_OCLUSION_PARALLAX: true },
      uniforms: {
        map: { value: colorMap },
        bumpMap: { value: depthMap },
        parallaxScale: { value: -1 * this.data.strength },
        parallaxMinLayers: { value: 20 },
        parallaxMaxLayers: { value: 30 },
        fade: { value: 0 },
      },
    });
    mesh.material = this.material;
  },
  tick() {
    if (this.el.sceneEl.camera) {
      this.el.sceneEl.camera.getWorldPosition(vec);
      this.el.object3D.worldToLocal(vec);
      const angle = vec.angleTo(forward);
      const fade = mapLinearClamped(
        angle,
        this.data.cutoffAngle - this.data.cutoffTransition,
        this.data.cutoffAngle + this.data.cutoffTransition,
        0, // In view zone, no fade
        1 // Outside view zone, full fade
      );
      this.material.uniforms.fade.value = fade;
    }
  },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function mapLinear(x, a1, a2, b1, b2) {
  return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1)
}

function mapLinearClamped(x, a1, a2, b1, b2) {
  return clamp(mapLinear(x, a1, a2, b1, b2), b1, b2)
}

var spinnerImage = "https://williamcaseylucas.github.io/core-components/f98b96fe3e06ea20.png";

/**
 * Description
 * ===========
 * create a HTML object by rendering a script that creates and manages it
 *
 */

// load and setup all the bits of the textures for the door
const loader = new THREE.TextureLoader();
const spinnerGeometry = new THREE.PlaneGeometry( 1, 1 );
const spinnerMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.1
});

loader.load(spinnerImage, (color) => {
    spinnerMaterial.map = color;
    spinnerMaterial.needsUpdate = true;
});

// var htmlComponents;
// var scriptPromise;
// if (window.__testingVueApps) {
//     scriptPromise = import(window.__testingVueApps)    
// } else {
//     scriptPromise = import("https://williamcaseylucas.github.io/vue-apps/dist/hubs.js") 
// }
// // scriptPromise = scriptPromise.then(module => {
// //     return module
// // });
/**
 * Modified from https://github.com/mozilla/hubs/blob/master/src/components/fader.js
 * to include adjustable duration and converted from component to system
 */

 AFRAME.registerSystem('html-script', {  
    init() {
        this.systemTick = vueComponents["systemTick"];
        this.initializeEthereal = vueComponents["initializeEthereal"];
        if (!this.systemTick || !this.initializeEthereal) {
            console.error("error in html-script system: htmlComponents has no systemTick and/or initializeEthereal methods");
        } else {
            this.initializeEthereal();
        }
    },
  
    tick(t, dt) {
        this.systemTick(t, dt);
    },
  });
  
const once = {
    once : true
};
  
AFRAME.registerComponent('html-script', {
    schema: {
        // name must follow the pattern "*_componentName"
        name: { type: "string", default: ""},
        width: { type: "number", default: -1},
        height: { type: "number", default: -1},
        parameter1: { type: "string", default: ""},
        parameter2: { type: "string", default: ""},
        parameter3: { type: "string", default: ""},
        parameter4: { type: "string", default: ""},
    },
    init: function () {
        this.script = null;
        this.fullName = this.data.name;

        this.scriptData = {
            width: this.data.width,
            height: this.data.height,
            parameter1: this.data.parameter1,
            parameter2: this.data.parameter2,
            parameter3: this.data.parameter3,
            parameter4: this.data.parameter4
        };

        this.loading = true;
        this.spinnerPlane = new THREE.Mesh( spinnerGeometry, spinnerMaterial );
        this.spinnerPlane.matrixAutoUpdate = true;
        this.spinnerPlane.position.z = 0.05;
        if (!this.fullName || this.fullName.length == 0) {
            this.parseNodeName();
        } else {
            this.componentName = this.fullName;
        }

        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        root && root.addEventListener("model-loaded", (ev) => { 
            this.createScript();
        }, once);

        //this.createScript();
    },

    update: function () {
        if (this.data.name === "" || this.data.name === this.fullName) return

        this.fullName = this.data.name;
        // this.parseNodeName();
        this.componentName = this.fullName;
        
        if (this.script) {
            this.destroyScript();
        }
        this.createScript();
    },

    createScript: function () {
        // each time we load a script component we will possibly create
        // a new networked component.  This is fine, since the networked Id 
        // is based on the full name passed as a parameter, or assigned to the
        // component in Spoke.  It does mean that if we have
        // multiple objects in the scene which have the same name, they will
        // be in sync.  It also means that if you want to drop a component on
        // the scene via a .glb, it must have a valid name parameter inside it.
        // A .glb in spoke will fall back to the spoke name if you use one without
        // a name inside it.
        let loader = () => {
            this.loadScript().then( () => {
                if (!this.script) return

                if (this.script.isNetworked) {
                    // get the parent networked entity, when it's finished initializing.  
                    // When creating this as part of a GLTF load, the 
                    // parent a few steps up will be networked.  We'll only do this
                    // if the HTML script wants to be networked
                    this.netEntity = null;

                    // bind callbacks
                    this.getSharedData = this.getSharedData.bind(this);
                    this.takeOwnership = this.takeOwnership.bind(this);
                    this.setSharedData = this.setSharedData.bind(this);

                    this.script.setNetworkMethods(this.takeOwnership, this.setSharedData);
                }

                // set up the local content and hook it to the scene
                const scriptEl = document.createElement('a-entity');
                this.simpleContainer = scriptEl;
                this.simpleContainer.object3D.matrixAutoUpdate = true;
                this.simpleContainer.setObject3D("weblayer3d", this.script.webLayer3D);

                // lets figure out the scale, but scaling to fill the a 1x1m square, that has also
                // potentially been scaled by the parents parent node. If we scale the entity in spoke,
                // this is where the scale is set.  If we drop a node in and scale it, the scale is also
                // set there.
                // We used to have a fixed size passed back from the entity, but that's too restrictive:
                // const width = this.script.width
                // const height = this.script.height

                // TODO: need to find environment-scene, go down two levels to the group above 
                // the nodes in the scene.  Then accumulate the scales up from this node to
                // that node.  This will account for groups, and nesting.

                var width = 1, height = 1;
                if (this.el.components["media-image"]) {
                    // attached to an image in spoke, so the image mesh is size 1 and is scaled directly
                    let scaleM = this.el.object3DMap["mesh"].scale;
                    let scaleI = this.el.object3D.scale;
                    width = scaleM.x * scaleI.x;
                    height = scaleM.y * scaleI.y;
                    scaleI.x = 1;
                    scaleI.y = 1;
                    scaleI.z = 1;
                    this.el.object3D.matrixNeedsUpdate = true;
                } else {
                    // it's embedded in a simple gltf model;  other models may not work
                    // we assume it's at the top level mesh, and that the model itself is scaled
                    let mesh = this.el.object3DMap["mesh"];
                    if (mesh) {
                        let box = mesh.geometry.boundingBox;
                        width = (box.max.x - box.min.x) * mesh.scale.x;
                        height = (box.max.y - box.min.y) * mesh.scale.y;
                    } else {
                        let meshScale = this.el.object3D.scale;
                        width = meshScale.x;
                        height = meshScale.y;
                        meshScale.x = 1;
                        meshScale.y = 1;
                        meshScale.z = 1;
                        this.el.object3D.matrixNeedsUpdate = true;
                    }
                    // apply the root gltf scale.
                    var parent2 = this.el.parentEl.parentEl.object3D;
                    width *= parent2.scale.x;
                    height *= parent2.scale.y;
                    parent2.scale.x = 1;
                    parent2.scale.y = 1;
                    parent2.scale.z = 1;
                    parent2.matrixNeedsUpdate = true;
                }

                this.actualWidth = width;
                this.actualHeight = height;

                if (width > 0 && height > 0) {
                    const {width: wsize, height: hsize} = this.script.getSize();
                    if (wsize > 0 && hsize > 0) {
                        var scale = Math.min(width / wsize, height / hsize);
                        this.simpleContainer.setAttribute("scale", { x: scale, y: scale, z: scale});
                    }
                    const spinnerScale = Math.min(width,height) * 0.25;
                    this.spinnerPlane.scale.set(spinnerScale, spinnerScale, 1);
                }

                // there will be one element already, the cube we created in blender
                // and attached this component to, so remove it if it is there.
                // this.el.object3D.children.pop()
                for (const c of this.el.object3D.children) {
                    c.visible = false;
                }

                // make sure "isStatic" is correct;  can't be static if either interactive or networked
                if (this.script.isStatic && (this.script.isInteractive || this.script.isNetworked)) {
                    this.script.isStatic = false;
                }
                            
                // add in our container
                this.el.appendChild(this.simpleContainer);

                this.el.setObject3D("spinner", this.spinnerPlane);

                // TODO:  we are going to have to make sure this works if 
                // the script is ON an interactable (like an image)
                
                if (this.script.isInteractive) {
                    if (this.el.classList.contains("interactable")) ;

                    // make the html object clickable
                    this.simpleContainer.setAttribute('is-remote-hover-target','');
                    this.simpleContainer.setAttribute('tags', {
                        singleActionButton: true,
                        inspectable: true,
                        isStatic: true,
                        togglesHoveredActionSet: true
                    });
                    this.simpleContainer.setAttribute('class', "interactable");

                    // forward the 'interact' events to our object 
                    this.clicked = this.clicked.bind(this);
                    this.simpleContainer.object3D.addEventListener('interact', this.clicked);

                    if (this.script.isDraggable) {
                        // we aren't going to really deal with this till we have a use case, but
                        // we can set it up for now
                        this.simpleContainer.setAttribute('tags', {
                            singleActionButton: true, 
                            isHoldable: true,  
                            holdableButton: true,
                            inspectable: true,
                            isStatic: true,
                            togglesHoveredActionSet: true
                        });
        
                        this.simpleContainer.object3D.addEventListener('holdable-button-down', (evt) => {
                            this.script.dragStart(evt);
                        });
                        this.simpleContainer.object3D.addEventListener('holdable-button-up', (evt) => {
                            this.script.dragEnd(evt);
                        });
                    }

                    //this.raycaster = new THREE.Raycaster()
                    this.hoverRayL = new THREE.Ray();
                    this.hoverRayR = new THREE.Ray();
                } else {
                    // no interactivity, please
                    if (this.el.classList.contains("interactable")) {
                        this.el.classList.remove("interactable");
                    }
                    this.el.removeAttribute("is-remote-hover-target");
                }

                // TODO: this SHOULD work but make sure it works if the el we are on
                // is networked, such as when attached to an image

                if (this.el.hasAttribute("networked")) {
                    this.el.removeAttribute("networked");
                }

                if (this.script.isNetworked) {
                    // This function finds an existing copy of the Networked Entity (if we are not the
                    // first client in the room it will exist in other clients and be created by NAF)
                    // or create an entity if we are first.
                    this.setupNetworkedEntity = function (networkedEl) {
                        var persistent = true;
                        var netId;
                        if (networkedEl) {
                            // We will be part of a Networked GLTF if the GLTF was dropped on the scene
                            // or pinned and loaded when we enter the room.  Use the networked parents
                            // networkId plus a disambiguating bit of text to create a unique Id.
                            netId = NAF.utils.getNetworkId(networkedEl) + "-html-script";

                            // if we need to create an entity, use the same persistence as our
                            // network entity (true if pinned, false if not)
                            persistent = entity.components.networked.data.persistent;
                        } else {
                            // this only happens if this component is on a scene file, since the
                            // elements on the scene aren't networked.  So let's assume each entity in the
                            // scene will have a unique name.  Adding a bit of text so we can find it
                            // in the DOM when debugging.
                            netId = this.fullName.replaceAll("_","-") + "-html-script";
                        }

                        // check if the networked entity we create for this component already exists. 
                        // otherwise, create it
                        // - NOTE: it is created on the scene, not as a child of this entity, because
                        //   NAF creates remote entities in the scene.
                        var entity;
                        if (NAF.entities.hasEntity(netId)) {
                            entity = NAF.entities.getEntity(netId);
                        } else {
                            entity = document.createElement('a-entity');

                            // store the method to retrieve the script data on this entity
                            entity.getSharedData = this.getSharedData;

                            // the "networked" component should have persistent=true, the template and 
                            // networkId set, owner set to "scene" (so that it doesn't update the rest of
                            // the world with it's initial data, and should NOT set creator (the system will do that)
                            entity.setAttribute('networked', {
                                template: "#script-data-media",
                                persistent: persistent,
                                owner: "scene",  // so that our initial value doesn't overwrite others
                                networkId: netId
                            });
                            this.el.sceneEl.appendChild(entity);
                        }

                        // save a pointer to the networked entity and then wait for it to be fully
                        // initialized before getting a pointer to the actual networked component in it
                        this.netEntity = entity;
                        NAF.utils.getNetworkedEntity(this.netEntity).then(networkedEl => {
                            this.stateSync = networkedEl.components["script-data"];

                            // if this is the first networked entity, it's sharedData will default to the  
                            // string "{}", and we should initialize it with the initial data from the script
                            if (this.stateSync.sharedData.length == 2) {
                                networkedEl.components["networked"];
                                // if (networked.data.creator == NAF.clientId) {
                                //     this.stateSync.initSharedData(this.script.getSharedData())
                                // }
                            }
                        });
                    };
                    this.setupNetworkedEntity = this.setupNetworkedEntity.bind(this);

                    this.setupNetworked = function () {
                        NAF.utils.getNetworkedEntity(this.el).then(networkedEl => {
                            this.setupNetworkedEntity(networkedEl);
                        }).catch(() => {
                            this.setupNetworkedEntity();
                        });
                    };
                    this.setupNetworked = this.setupNetworked.bind(this);

                    // This method handles the different startup cases:
                    // - if the GLTF was dropped on the scene, NAF will be connected and we can 
                    //   immediately initialize
                    // - if the GLTF is in the room scene or pinned, it will likely be created
                    //   before NAF is started and connected, so we wait for an event that is
                    //   fired when Hubs has started NAF
                    if (NAF.connection && NAF.connection.isConnected()) {
                        this.setupNetworked();
                    } else {
                        this.el.sceneEl.addEventListener('didConnectToNetworkedScene', this.setupNetworked);
                    }
                }
            }).catch(e => {
                console.error("loadScript failed for script " + this.data.name + ": " + e);
            });
        };
        // if attached to a node with a media-loader component, this means we attached this component
        // to a media object in Spoke.  We should wait till the object is fully loaded.  
        // Otherwise, it was attached to something inside a GLTF (probably in blender)
        if (this.el.components["media-loader"]) {
            this.el.addEventListener("media-loaded", () => {
                loader();
            },
            { once: true });
        } else {
            loader();
        }
    },

    play: function () {
        if (this.script) {
            this.script.play();
        }
    },

    pause: function () {
        if (this.script) {
            this.script.pause();
        }
    },

    // handle "interact" events for clickable entities
    clicked: function(evt) {
        console.log("clicked on html: ", evt);
        this.script.clicked(evt); 
    },
  
    // methods that will be passed to the html object so they can update networked data
    takeOwnership: function() {
        if (this.stateSync) {
            return this.stateSync.takeOwnership()
        } else {
            return true;  // sure, go ahead and change it for now
        }
    },
    
    setSharedData: function(dataObject) {
        if (this.stateSync) {
            return this.stateSync.setSharedData(dataObject)
        }
        return true
    },

    // this is called from below, to get the initial data from the script
    getSharedData: function() {
        if (this.script) {
            return this.script.getSharedData()
        }
        // shouldn't happen
        console.warn("script-data component called parent element but there is no script yet?");
        return "{}"
    },

    // per frame stuff
    tick: function (time) {
        if (!this.script) return

        if (this.loading) {
            this.spinnerPlane.rotation.z += 0.03;
        } else {
            if (this.script.isInteractive) {
                // more or less copied from "hoverable-visuals.js" in hubs
                const toggling = this.el.sceneEl.systems["hubs-systems"].cursorTogglingSystem;
                var passthruInteractor = [];

                let interactorOne, interactorTwo;
                const interaction = this.el.sceneEl.systems.interaction;
                if (!interaction.ready) return; //DOMContentReady workaround
                
                let hoverEl = this.simpleContainer;
                if (interaction.state.leftHand.hovered === hoverEl && !interaction.state.leftHand.held) {
                interactorOne = interaction.options.leftHand.entity.object3D;
                }
                if (
                interaction.state.leftRemote.hovered === hoverEl &&
                !interaction.state.leftRemote.held &&
                !toggling.leftToggledOff
                ) {
                interactorOne = interaction.options.leftRemote.entity.object3D;
                }
                if (interactorOne) {
                    let pos = interactorOne.position;
                    let dir = this.script.webLayer3D.getWorldDirection(new THREE.Vector3()).negate();
                    pos.addScaledVector(dir, -0.1);
                    this.hoverRayL.set(pos, dir);

                    passthruInteractor.push(this.hoverRayL);
                }
                if (
                interaction.state.rightRemote.hovered === hoverEl &&
                !interaction.state.rightRemote.held &&
                !toggling.rightToggledOff
                ) {
                interactorTwo = interaction.options.rightRemote.entity.object3D;
                }
                if (interaction.state.rightHand.hovered === hoverEl && !interaction.state.rightHand.held) {
                    interactorTwo = interaction.options.rightHand.entity.object3D;
                }
                if (interactorTwo) {
                    let pos = interactorTwo.position;
                    let dir = this.script.webLayer3D.getWorldDirection(new THREE.Vector3()).negate();
                    pos.addScaledVector(dir, -0.1);
                    this.hoverRayR.set(pos, dir);
                    passthruInteractor.push(this.hoverRayR);
                }

                this.script.webLayer3D.interactionRays = passthruInteractor;
            }

            if (this.script.isNetworked) {
                // if we haven't finished setting up the networked entity don't do anything.
                if (!this.netEntity || !this.stateSync) { return }

                // if the state has changed in the networked data, update our html object
                if (this.stateSync.changed) {
                    this.stateSync.changed = false;
                    this.script.updateSharedData(this.stateSync.dataObject);
                }
            }

            this.script.tick(time);
        }
    },
  
    // TODO:  should only be called if there is no parameter specifying the
    // html script name.
    parseNodeName: function () {
        if (this.fullName === "") {

            // TODO:  switch this to find environment-root and go down to 
            // the node at the room of scene (one above the various nodes).  
            // then go up from here till we get to a node that has that node
            // as it's parent
            this.fullName = this.el.parentEl.parentEl.className;
        } 

        // nodes should be named anything at the beginning with 
        //  "componentName"
        // at the very end.  This will fetch the component from the resource
        // componentName
        const params = this.fullName.match(/_([A-Za-z0-9]*)$/);

        // if pattern matches, we will have length of 3, first match is the dir,
        // second is the componentName name or number
        if (!params || params.length < 2) {
            console.warn("html-script componentName not formatted correctly: ", this.fullName);
            this.componentName = null;
        } else {
            this.componentName = params[1];
        }
    },

    loadScript: async function () {
        // if (scriptPromise) {
        //     try {
        //         htmlComponents = await scriptPromise;
        //     } catch(e) {
        //         console.error(e);
        //         return
        //     }
        //     scriptPromise = null
        // }
        var initScript = vueComponents[this.componentName];
        if (!initScript) {
            console.warn("'html-script' component doesn't have script for " + this.componentName);
            this.script = null;
            return;
        }

        try {
            this.script = initScript(this.scriptData);
        } catch (e) {
            console.error("error creating script for " + this.componentName, e);
            this.script = null;
        }
        if (this.script){
            this.script.needsUpdate = true;
            // this.script.webLayer3D.refresh(true)
            // this.script.webLayer3D.update(true)
            this.script.webLayer3D.visible = false;

            this.script.waitForReady().then(() => {
                const {width: wsize, height: hsize} = this.script.getSize();
                if (wsize > 0 && hsize > 0) {
                    var scale = Math.min(this.actualWidth / wsize, this.actualHeight / hsize);
                    this.simpleContainer.setAttribute("scale", { x: scale, y: scale, z: scale});
                }

                // when a script finishes getting ready, tell the 
                // portals to update themselves
                this.script.webLayer3D.visible = true;
                this.loading = false;
                this.el.removeObject3D("spinner");
                this.el.sceneEl.emit('updatePortals'); 
            });
		} else {
            console.warn("'html-script' component failed to initialize script for " + this.componentName);
        }
    },

    remove: function () {
        this.destroyScript();
    },

    destroyScript: function () {
        if (this.script.isInteractive) {
            this.simpleContainer.object3D.removeEventListener('interact', this.clicked);
        }

        window.APP.scene.removeEventListener('didConnectToNetworkedScene', this.setupNetworked);

        this.el.removeChild(this.simpleContainer);
        this.simpleContainer.removeObject3D("weblayer3d");
        this.simpleContainer = null;

        if (this.script.isNetworked && this.netEntity.parentNode) {
            this.netEntity.parentNode.removeChild(this.netEntity);
        }
        this.script.destroy();
        this.script = null;
    }
});

//
// Component for our networked state.  This component does nothing except all us to 
// change the state when appropriate. We could set this up to signal the component above when
// something has changed, instead of having the component above poll each frame.
//

AFRAME.registerComponent('script-data', {
    schema: {
        scriptdata: {type: "string", default: "{}"},
    },
    init: function () {
        this.takeOwnership = this.takeOwnership.bind(this);
        this.setSharedData = this.setSharedData.bind(this);

        this.dataObject = this.el.getSharedData();
        try {
            this.sharedData = encodeURIComponent(JSON.stringify(this.dataObject));
            this.el.setAttribute("script-data", "scriptdata", this.sharedData);
        } catch(e) {
            console.error("Couldn't encode initial script data object: ", e, this.dataObject);
            this.sharedData = "{}";
            this.dataObject = {};
        }
        this.changed = false;
    },

    update() {
        this.changed = !(this.sharedData === this.data.scriptdata);
        if (this.changed) {
            try {
                this.dataObject = JSON.parse(decodeURIComponent(this.data.scriptdata));

                // do these after the JSON parse to make sure it has succeeded
                this.sharedData = this.data.scriptdata;
                this.changed = true;
            } catch(e) {
                console.error("couldn't parse JSON received in script-sync: ", e);
                this.sharedData = "{}";
                this.dataObject = {};
            }
        }
    },

    // it is likely that applyPersistentSync only needs to be called for persistent
    // networked entities, so we _probably_ don't need to do this.  But if there is no
    // persistent data saved from the network for this entity, this command does nothing.
    play() {
        if (this.el.components.networked) {
            // not sure if this is really needed, but can't hurt
            if (APP.utils) { // temporary till we ship new client
                APP.utils.applyPersistentSync(this.el.components.networked.data.networkId);
            }
        }
    },

    takeOwnership() {
        if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return false;

        return true;
    },

    // initSharedData(dataObject) {
    //     try {
    //         var htmlString = encodeURIComponent(JSON.stringify(dataObject))
    //         this.sharedData = htmlString
    //         this.dataObject = dataObject
    //         return true
    //     } catch (e) {
    //         console.error("can't stringify the object passed to script-sync")
    //         return false
    //     }
    // },

    // The key part in these methods (which are called from the component above) is to
    // check if we are allowed to change the networked object.  If we own it (isMine() is true)
    // we can change it.  If we don't own in, we can try to become the owner with
    // takeOwnership(). If this succeeds, we can set the data.  
    //
    // NOTE: takeOwnership ATTEMPTS to become the owner, by assuming it can become the
    // owner and notifying the networked copies.  If two or more entities try to become
    // owner,  only one (the last one to try) becomes the owner.  Any state updates done
    // by the "failed attempted owners" will not be distributed to the other clients,
    // and will be overwritten (eventually) by updates from the other clients.   By not
    // attempting to guarantee ownership, this call is fast and synchronous.  Any 
    // methods for guaranteeing ownership change would take a non-trivial amount of time
    // because of network latencies.

    setSharedData(dataObject) {
        if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return false;

        try {
            var htmlString = encodeURIComponent(JSON.stringify(dataObject));
            this.sharedData = htmlString;
            this.dataObject = dataObject;
            this.el.setAttribute("script-data", "scriptdata", htmlString);
            return true
        } catch (e) {
            console.error("can't stringify the object passed to script-sync");
            return false
        }
    }
});

// Add our template for our networked object to the a-frame assets object,
// and a schema to the NAF.schemas.  Both must be there to have custom components work

const assets = document.querySelector("a-assets");

assets.insertAdjacentHTML(
    'beforeend',
    `
    <template id="script-data-media">
      <a-entity
        script-data
      ></a-entity>
    </template>
  `
  );

NAF.schemas.add({
  	template: "#script-data-media",
    components: [
    // {
    //     component: "script-data",
    //     property: "rotation",
    //     requiresNetworkUpdate: vectorRequiresUpdate(0.001)
    // },
    // {
    //     component: "script-data",
    //     property: "scale",
    //     requiresNetworkUpdate: vectorRequiresUpdate(0.001)
    // },
    {
      	component: "script-data",
      	property: "scriptdata"
    }],
      nonAuthorizedComponents: [
      {
            component: "script-data",
            property: "scriptdata"
      }
    ],

  });

/**
 * control a video from a component you stand on.  Implements a radius from the center of
 * the object it's attached to, in meters
 */
AFRAME.registerComponent('video-control-pad', {
    mediaVideo: {},
    schema: {
        target: { type: 'string', default: "" },
        radius: { type: 'number', default: 1 }
    },
    init: function () {
        if (this.data.target.length == 0) {
            console.warn("video-control-pad must have 'target' set");
            return;
        }
        // wait until the scene loads to finish.  We want to make sure everything
        // is initialized
        let root = findAncestorWithComponent(this.el, "gltf-model-plus");
        root && root.addEventListener("model-loaded", () => {
            this.initialize();
        });
    },
    initialize: function () {
        var _a;
        let v = (_a = this.el.sceneEl) === null || _a === void 0 ? void 0 : _a.object3D.getObjectByName(this.data.target);
        if (v == undefined) {
            console.warn("video-control-pad target '" + this.data.target + "' does not exist");
            return;
        }
        if (v.el.components["media-loader"] || v.el.components["media-video"]) {
            if (v.el.components["media-loader"]) {
                let fn = () => {
                    this.setupVideoPad(v);
                    v.el.removeEventListener('model-loaded', fn);
                };
                v.el.addEventListener("media-loaded", fn);
            }
            else {
                this.setupVideoPad(v);
            }
        }
        else {
            console.warn("video-control-pad target '" + this.data.target + "' is not a video element");
        }
    },
    setupVideoPad: function (video) {
        this.mediaVideo = video.el.components["media-video"];
        if (this.mediaVideo == undefined) {
            console.warn("video-control-pad target '" + this.data.target + "' is not a video element");
        }
        // //@ts-ignore
        // if (!this.mediaVideo.video.paused) {
        //     //@ts-ignore
        //     this.mediaVideo.togglePlaying()
        // }
        this.el.setAttribute('proximity-events', { radius: this.data.radius, Yoffset: 1.6 });
        this.el.addEventListener('proximityenter', () => this.enterRegion());
        this.el.addEventListener('proximityleave', () => this.leaveRegion());
    },
    enterRegion: function () {
        if (this.mediaVideo.data.videoPaused) {
            //@ts-ignore
            this.mediaVideo.togglePlaying();
        }
    },
    leaveRegion: function () {
        if (!this.mediaVideo.data.videoPaused) {
            //@ts-ignore
            this.mediaVideo.togglePlaying();
        }
    },
});

new THREE.Vector3();
new THREE.Quaternion();

const IDENTITY = new THREE.Matrix4().identity();
function setMatrixWorld(object3D, m) {
  if (!object3D.matrixIsModified) {
    object3D.applyMatrix(IDENTITY); // hack around our matrix optimizations
  }
  object3D.matrixWorld.copy(m);
  if (object3D.parent) {
    object3D.parent.updateMatrices();
    object3D.matrix = object3D.matrix.getInverse(object3D.parent.matrixWorld).multiply(object3D.matrixWorld);
  } else {
    object3D.matrix.copy(object3D.matrixWorld);
  }
  object3D.matrix.decompose(object3D.position, object3D.quaternion, object3D.scale);
  object3D.childrenNeedMatrixWorldUpdate = true;
}

((function() {
  const mat4 = new THREE.Matrix4();
  const end = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3()
  };
  const start = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3()
  };
  const interpolated = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3()
  };
  return function(startMat4, endMat4, progress, outMat4) {
    start.quaternion.setFromRotationMatrix(mat4.extractRotation(startMat4));
    end.quaternion.setFromRotationMatrix(mat4.extractRotation(endMat4));
    THREE.Quaternion.slerp(start.quaternion, end.quaternion, interpolated.quaternion, progress);
    interpolated.position.lerpVectors(
      start.position.setFromMatrixColumn(startMat4, 3),
      end.position.setFromMatrixColumn(endMat4, 3),
      progress
    );
    interpolated.scale.lerpVectors(
      start.scale.setFromMatrixScale(startMat4),
      end.scale.setFromMatrixScale(endMat4),
      progress
    );
    return outMat4.compose(
      interpolated.position,
      interpolated.quaternion,
      interpolated.scale
    );
  };
}))();

((function() {
  const posA = new THREE.Vector3();
  const posB = new THREE.Vector3();
  return function(objA, objB) {
    objA.updateMatrices();
    objB.updateMatrices();
    posA.setFromMatrixColumn(objA.matrixWorld, 3);
    posB.setFromMatrixColumn(objB.matrixWorld, 3);
    return posA.distanceToSquared(posB);
  };
}))();

const affixToWorldUp = (function() {
  const inRotationMat4 = new THREE.Matrix4();
  const inForward = new THREE.Vector3();
  const outForward = new THREE.Vector3();
  const outSide = new THREE.Vector3();
  const worldUp = new THREE.Vector3(); // Could be called "outUp"
  const v = new THREE.Vector3();
  const inMat4Copy = new THREE.Matrix4();
  return function affixToWorldUp(inMat4, outMat4) {
    inRotationMat4.identity().extractRotation(inMat4Copy.copy(inMat4));
    inForward.setFromMatrixColumn(inRotationMat4, 2).multiplyScalar(-1);
    outForward
      .copy(inForward)
      .sub(v.copy(inForward).projectOnVector(worldUp.set(0, 1, 0)))
      .normalize();
    outSide.crossVectors(outForward, worldUp);
    outMat4.makeBasis(outSide, worldUp, outForward.multiplyScalar(-1));
    outMat4.scale(v.setFromMatrixScale(inMat4Copy));
    outMat4.setPosition(v.setFromMatrixColumn(inMat4Copy, 3));
    return outMat4;
  };
})();

((function() {
  const upAffixedCameraTransform = new THREE.Matrix4();
  const upAffixedWaypointTransform = new THREE.Matrix4();
  const detachFromWorldUp = new THREE.Matrix4();
  return function calculateCameraTransformForWaypoint(cameraTransform, waypointTransform, outMat4) {
    affixToWorldUp(cameraTransform, upAffixedCameraTransform);
    detachFromWorldUp.getInverse(upAffixedCameraTransform).multiply(cameraTransform);
    affixToWorldUp(waypointTransform, upAffixedWaypointTransform);
    outMat4.copy(upAffixedWaypointTransform).multiply(detachFromWorldUp);
  };
}))();

((function() {
  const inMat4Copy = new THREE.Matrix4();
  const startRotation = new THREE.Matrix4();
  const endRotation = new THREE.Matrix4();
  const v = new THREE.Vector3();
  return function rotateInPlaceAroundWorldUp(inMat4, theta, outMat4) {
    inMat4Copy.copy(inMat4);
    return outMat4
      .copy(endRotation.makeRotationY(theta).multiply(startRotation.extractRotation(inMat4Copy)))
      .scale(v.setFromMatrixScale(inMat4Copy))
      .setPosition(v.setFromMatrixPosition(inMat4Copy));
  };
}))();

((function() {
  const inverseParentWorld = new THREE.Matrix4();
  const childRelativeToParent = new THREE.Matrix4();
  const childInverse = new THREE.Matrix4();
  const newParentMatrix = new THREE.Matrix4();
  // transform the parent such that its child matches the target
  return function childMatch(parent, child, target) {
    parent.updateMatrices();
    inverseParentWorld.getInverse(parent.matrixWorld);
    child.updateMatrices();
    childRelativeToParent.multiplyMatrices(inverseParentWorld, child.matrixWorld);
    childInverse.getInverse(childRelativeToParent);
    newParentMatrix.multiplyMatrices(target, childInverse);
    setMatrixWorld(parent, newParentMatrix);
  };
}))();

const calculatePlaneMatrix = (function () {
    const planeMatrix = new THREE.Matrix4();
    const planeUp = new THREE.Vector3();
    const planeForward = new THREE.Vector3();
    const planeRight = new THREE.Vector3();
    const planePosition = new THREE.Vector3();
    const camPosition = new THREE.Vector3();

    return function calculatePlaneMatrix(camera, button) {
        camera.updateMatrices();
        camPosition.setFromMatrixPosition(camera.matrixWorld);
        button.updateMatrices();
        planePosition.setFromMatrixPosition(button.matrixWorld);
        planeForward.subVectors(planePosition, camPosition);
        planeForward.y = 0;
        planeForward.normalize();
        planeUp.set(0, 1, 0);
        planeRight.crossVectors(planeForward, planeUp);
        planeMatrix.makeBasis(planeRight, planeUp, planeForward.multiplyScalar(-1));
        planeMatrix.elements[12] = planePosition.x;
        planeMatrix.elements[13] = planePosition.y;
        planeMatrix.elements[14] = planePosition.z;
        return planeMatrix;
    };
})();

const planeForLeftCursor = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(100000, 100000, 2, 2),
    new THREE.MeshBasicMaterial({
        visible: true,
        wireframe: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3
    })
);
const planeForRightCursor = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(100000, 100000, 2, 2),
    new THREE.MeshBasicMaterial({
        visible: true,
        wireframe: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3
    })
);

class HandleInteraction {
    constructor(el) {
        this.el = el;

        this.isDragging = false;
        this.dragInteractor = null;
        this.planeRotation = new THREE.Matrix4();
        this.planeUp = new THREE.Vector3();
        this.planeRight = new THREE.Vector3();
        this.intersections = [];
        this.initialIntersectionPoint = new THREE.Vector3();
        this.intersectionPoint = new THREE.Vector3();
        this.delta = {
            x: 0,
            y: 0
        };
        this.objectMatrix = new THREE.Matrix4();
        this.dragVector = new THREE.Vector3();

        this.camPosition = new THREE.Vector3();
        this.objectPosition = new THREE.Vector3();
        this.objectToCam = new THREE.Vector3();
    }

    getInteractors(obj) {
        let toggling = this.el.sceneEl.systems["hubs-systems"].cursorTogglingSystem;

        // more or less copied from "hoverable-visuals.js" in hubs
        const interaction = this.el.sceneEl.systems.interaction;
        var passthruInteractor = [];

        let interactorOne, interactorTwo;
        if (!interaction.ready) return; //DOMContentReady workaround

        // TODO:  may want to look to see the hovered objects are children of obj??
        let hoverEl = obj;
        if (interaction.state.leftHand.hovered === hoverEl && !interaction.state.leftHand.held) {
            interactorOne = {
                cursor: interaction.options.leftHand.entity.object3D,
                controller: interaction.leftCursorControllerEl.components["cursor-controller"]
            };
        }
        if (
            interaction.state.leftRemote.hovered === hoverEl &&
            !interaction.state.leftRemote.held &&
            !toggling.leftToggledOff
        ) {
            interactorOne = {
                cursor: interaction.options.leftRemote.entity.object3D,
                controller: interaction.leftCursorControllerEl.components["cursor-controller"]
            };

        }
        if (interactorOne) {
            passthruInteractor.push(interactorOne);
        }
        if (
            interaction.state.rightRemote.hovered === hoverEl &&
            !interaction.state.rightRemote.held &&
            !toggling.rightToggledOff
        ) {
            interactorTwo = {
                cursor: interaction.options.rightRemote.entity.object3D,
                controller: interaction.rightCursorControllerEl.components["cursor-controller"]
            };
        }
        if (interaction.state.rightHand.hovered === hoverEl && !interaction.state.rightHand.held) {
            interactorTwo = {
                cursor: interaction.options.rightHand.entity.object3D,
                controller: interaction.rightCursorControllerEl.components["cursor-controller"]
            };
        }
        if (interactorTwo) {
            passthruInteractor.push(interactorTwo);
        }
        return passthruInteractor
    }

    getRefs() {
        if (!this.didGetObjectReferences) {
            this.didGetObjectReferences = true;
            const interaction = this.el.sceneEl.systems.interaction;

            // this.leftEventer = document.getElementById("left-cursor").object3D;
            // this.leftCursorController = document.getElementById("left-cursor-controller");
            // this.leftRaycaster = this.leftCursorController.components["cursor-controller"].raycaster;
            // this.rightCursorController = document.getElementById("right-cursor-controller");
            // this.rightRaycaster = this.rightCursorController.components["cursor-controller"].raycaster;
            this.leftEventer = interaction.options.leftRemote.entity.object3D;
            this.leftCursorController = interaction.leftCursorControllerEl.components["cursor-controller"];
            this.leftRaycaster = this.leftCursorController.raycaster;
            this.rightCursorController = interaction.rightCursorControllerEl.components["cursor-controller"];
            this.rightRaycaster = this.rightCursorController.raycaster;

            this.viewingCamera = document.getElementById("viewing-camera").object3DMap.camera;
        }
    }

    getIntersection(interactor, targets) {
        this.getRefs();
        let object3D = interactor.cursor;
        let raycaster = object3D === this.leftEventer ? this.leftRaycaster : this.rightRaycaster;

        let intersects = raycaster.intersectObjects(targets, true);
        if (intersects.length > 0) {
            return intersects[0];
        }
        return null;
    }

    startDrag(e, object3D, intersection) {
        if (this.isDragging) {
            return false;
        }
        this.getRefs();
        object3D = object3D || this.el.object3D;
        this.raycaster = e.object3D === this.leftEventer ? this.leftRaycaster : this.rightRaycaster;

        if (!intersection) {
            this.plane = e.object3D === this.leftEventer ? planeForLeftCursor : planeForRightCursor;
            setMatrixWorld(this.plane, calculatePlaneMatrix(this.viewingCamera, object3D));
            this.planeRotation.extractRotation(this.plane.matrixWorld);
            this.planeUp.set(0, 1, 0).applyMatrix4(this.planeRotation);
            this.planeRight.set(1, 0, 0).applyMatrix4(this.planeRotation);
            intersection = this.raycastOnPlane();

            // shouldn't happen, but we should check
            if (!intersection) return false;
        } else {
            this.plane = null;
        }

        this.isDragging = true;
        this.dragInteractor = {
            cursor: e.object3D,
            controller: e.object3D === this.leftEventer ? this.leftCursorController : this.rightCursorController,
        };

        this.initialIntersectionPoint.copy(intersection.point);
        this.initialDistanceToObject = this.objectToCam
            .subVectors(
                this.camPosition.setFromMatrixPosition(this.viewingCamera.matrixWorld),
                this.objectPosition.setFromMatrixPosition(object3D.matrixWorld)
            )
            .length();
        this.intersectionRight = 0;
        this.intersectionUp = 0;
        this.delta = {
            x: 0,
            y: 0
        };

        return true
    }

    endDrag(e) {
        if (!this.isDragging) {
            return;
        }
        if (
            (e.object3D === this.leftEventer && this.raycaster === this.leftRaycaster) ||
            (e.object3D !== this.leftEventer && this.raycaster === this.rightRaycaster)
        ) {
            this.isDragging = false;
            this.dragInteractor = null;
        }
    }

    raycastOnPlane() {
        this.intersections.length = 0;
        const far = this.raycaster.far;
        this.raycaster.far = 1000;
        this.plane.raycast(this.raycaster, this.intersections);
        this.raycaster.far = far;
        return this.intersections[0];
    }

    drag() {
        if (!this.isDragging) return null;
        if (this.plane) {
            const intersection = this.raycastOnPlane();
            if (!intersection) return null;
            this.intersectionPoint.copy(intersection.point);
        } else {
            this.intersectionPoint = this.raycaster.ray.origin.clone();
            this.intersectionPoint.addScaledVector(this.raycaster.ray.direction, this.initialDistanceToObject);    
        }
        this.dragVector.subVectors(this.intersectionPoint, this.initialIntersectionPoint);

        // delta doesn't make much sense for non-planar dragging, but assign something anyway
        this.delta.x = this.plane ? this.dragVector.dot(this.planeUp) : this.dragVector.x;
        this.delta.y = this.plane ? this.dragVector.dot(this.planeRight) : this.dragVector.y;
        return this.dragVector;
    }
}


// template

function interactiveComponentTemplate(componentName) {
    return {
        startInit: function () {
            this.fullName = this.el.parentEl.parentEl.className;
            this.relativeSize = 1;
            this.isDraggable = false;
            this.isInteractive = false;
            this.isNetworked = false;

            // some methods
            this.internalClicked = this.internalClicked.bind(this);
            this.internalDragStart = this.internalDragStart.bind(this);
            this.internalDragEnd = this.internalDragEnd.bind(this);
        },        
        
        finishInit: function () {
            let root = findAncestorWithComponent(this.el, "gltf-model-plus");
            root && root.addEventListener("model-loaded", (ev) => {
                this.internalInit();
            });
        },

        internalClicked: function(evt) {
            this.clicked && this.clicked(evt);
        },

        internalDragStart: function(evt) {
            this.dragStart(evt);
        },

        internalDragEnd: function(evt) {
            this.dragEnd(evt);
        },

        removeTemplate: function () {
            if (this.isInteractive) {
                this.simpleContainer.object3D.removeEventListener('interact', this.internalClicked);
            }
            this.el.removeChild(this.simpleContainer);
            this.simpleContainer = null;
    
            if (this.isNetworked && this.netEntity.parentNode) {
                this.netEntity.parentNode.removeChild(this.netEntity);
            }    
        },

        internalInit: function () {
            // each time we load a component we will possibly create
            // a new networked component.  This is fine, since the networked Id 
            // is based on the name passed as a parameter, or assigned to the
            // component in Spoke.  It does mean that if we have
            // multiple objects in the scene which have the same name, they will
            // be in sync.  It also means that if you want to drop a component on
            // the scene via a .glb, it must have a valid name parameter inside it.
            // A .glb in spoke will fall back to the spoke name if you use one without
            // a name inside it.
            let loader = () => {
                // lets load something externally, like a json config file
                this.loadData().then(() => {
                    if (this.isNetworked) {
                        // get the parent networked entity, when it's finished initializing.  
                        // When creating this as part of a GLTF load, the 
                        // parent a few steps up will be networked. 
                        this.netEntity = null;

                        // bind callbacks
                        this.getSharedData = this.getSharedData.bind(this);
                        this.setSharedData = this.setSharedData.bind(this);
                    }

                    // set up the local content and hook it to the scene
                    this.simpleContainer = document.createElement('a-entity');
                    this.simpleContainer.object3D.matrixAutoUpdate = true;

                    this.initializeData();
                    // lets figure out the scale, by scaling to fill the a 1x1m square, that has also
                    // potentially been scaled by the parents parent node. If we scale the entity in spoke,
                    // this is where the scale is set.  If we drop a node in and scale it, the scale is also
                    // set there.

                    // TODO: need to find environment-scene, go down two levels to the group above 
                    // the nodes in the scene.  Then accumulate the scales up from this node to
                    // that node.  This will account for groups, and nesting.

                    var width = 1,
                        height = 1;
                    if (this.el.components["media-image"]) {
                        // attached to an image in spoke, so the image mesh is size 1 and is scaled directly
                        let scaleM = this.el.object3DMap["mesh"].scale;
                        let scaleI = this.el.object3D.scale;
                        width = scaleM.x * scaleI.x;
                        height = scaleM.y * scaleI.y;
                        scaleI.x = 1;
                        scaleI.y = 1;
                        scaleI.z = 1;
                        this.el.object3D.matrixNeedsUpdate = true;
                    } else {
                        // PROBABLY DONT NEED TO SUPPORT THIS ANYMORE
                        // it's embedded in a simple gltf model;  other models may not work
                        // we assume it's at the top level mesh, and that the model itself is scaled
                        let mesh = this.el.object3DMap["mesh"];
                        if (mesh) {
                            let box = mesh.geometry.boundingBox;
                            width = (box.max.x - box.min.x) * mesh.scale.x;
                            height = (box.max.y - box.min.y) * mesh.scale.y;
                        } else {
                            let meshScale = this.el.object3D.scale;
                            width = meshScale.x;
                            height = meshScale.y;
                            meshScale.x = 1;
                            meshScale.y = 1;
                            meshScale.z = 1;
                            this.el.object3D.matrixNeedsUpdate = true;
                        }
                        // apply the root gltf scale.
                        var parent2 = this.el.parentEl.parentEl.object3D;
                        width *= parent2.scale.x;
                        height *= parent2.scale.y;
                        parent2.scale.x = 1;
                        parent2.scale.y = 1;
                        parent2.scale.z = 1;
                        parent2.matrixNeedsUpdate = true;
                    }

                    if (width > 0 && height > 0) {
                        var scale = Math.min(width * this.relativeSize, height * this.relativeSize);
                        this.simpleContainer.setAttribute("scale", {
                            x: scale,
                            y: scale,
                            z: scale
                        });
                    }

                    // there might be some elements already, like the cube we created in blender
                    // and attached this component to, so hide them if they are there.
                    for (const c of this.el.object3D.children) {
                        c.visible = false;
                    }

                    // add in our container
                    this.el.appendChild(this.simpleContainer);

                    // TODO:  we are going to have to make sure this works if 
                    // the component is ON an interactable (like an image)

                    if (this.isInteractive) {
                        this.handleInteraction = new HandleInteraction(this.el);

                        // make the object clickable
                        this.simpleContainer.setAttribute('is-remote-hover-target', '');
                        this.simpleContainer.setAttribute('tags', {
                            singleActionButton: true,
                            inspectable: true,
                            isStatic: true,
                            togglesHoveredActionSet: true
                        });
                        this.simpleContainer.setAttribute('class', "interactable");

                        // forward the 'interact' events to our object 
                        this.clicked = this.clicked.bind(this);
                        this.simpleContainer.object3D.addEventListener('interact', this.internalClicked);

                        if (this.isDraggable) {
                            // we aren't going to really deal with this till we have a use case, but
                            // we can set it up for now
                            this.simpleContainer.setAttribute('tags', {
                                singleActionButton: true,
                                isHoldable: true,
                                holdableButton: true,
                                inspectable: true,
                                isStatic: true,
                                togglesHoveredActionSet: true
                            });

                            this.dragStart = this.dragStart.bind(this);
                            this.dragEnd = this.dragEnd.bind(this);
                            this.simpleContainer.object3D.addEventListener('holdable-button-down', this.internalDragStart);
                            this.simpleContainer.object3D.addEventListener('holdable-button-up', this.internalDragEnd);
                        }

                        //this.raycaster = new THREE.Raycaster()
                        this.hoverRayL = new THREE.Ray();
                        this.hoverRayR = new THREE.Ray();
                    } else {
                        // no interactivity, please
                        if (this.el.classList.contains("interactable")) {
                            this.el.classList.remove("interactable");
                        }
                        this.el.removeAttribute("is-remote-hover-target");
                    }

                    // TODO: this SHOULD work but make sure it works if the el we are on
                    // is networked, such as when attached to an image

                    if (this.el.hasAttribute("networked")) {
                        this.el.removeAttribute("networked");
                    }

                    if (this.isNetworked) {
                        // This function finds an existing copy of the Networked Entity (if we are not the
                        // first client in the room it will exist in other clients and be created by NAF)
                        // or create an entity if we are first.
                        this.setupNetworkedEntity = function (networkedEl) {
                            var persistent = true;
                            var netId;
                            if (networkedEl) {
                                // We will be part of a Networked GLTF if the GLTF was dropped on the scene
                                // or pinned and loaded when we enter the room.  Use the networked parents
                                // networkId plus a disambiguating bit of text to create a unique Id.
                                netId = NAF.utils.getNetworkId(networkedEl) + "-" + componentName;

                                // if we need to create an entity, use the same persistence as our
                                // network entity (true if pinned, false if not)
                                persistent = entity.components.networked.data.persistent;
                            } else {
                                // this only happens if this component is on a scene file, since the
                                // elements on the scene aren't networked.  So let's assume each entity in the
                                // scene will have a unique name.  Adding a bit of text so we can find it
                                // in the DOM when debugging.
                                netId = this.fullName.replaceAll("_", "-") + "-" + componentName;
                            }

                            // check if the networked entity we create for this component already exists. 
                            // otherwise, create it
                            // - NOTE: it is created on the scene, not as a child of this entity, because
                            //   NAF creates remote entities in the scene.
                            var entity;
                            if (NAF.entities.hasEntity(netId)) {
                                entity = NAF.entities.getEntity(netId);
                            } else {
                                entity = document.createElement('a-entity');

                                // store the method to retrieve the data on this entity
                                entity.getSharedData = this.getSharedData;

                                // the "networked" component should have persistent=true, the template and 
                                // networkId set, owner set to "scene" (so that it doesn't update the rest of
                                // the world with it's initial data, and should NOT set creator (the system will do that)
                                entity.setAttribute('networked', {
                                    template: "#" + componentName + "-data-media",
                                    persistent: persistent,
                                    owner: "scene", // so that our initial value doesn't overwrite others
                                    networkId: netId
                                });
                                this.el.sceneEl.appendChild(entity);
                            }

                            // save a pointer to the networked entity and then wait for it to be fully
                            // initialized before getting a pointer to the actual networked component in it
                            this.netEntity = entity;
                            NAF.utils.getNetworkedEntity(this.netEntity).then(networkedEl => {
                                this.stateSync = networkedEl.components[componentName + "-data"];
                            });
                        };
                        this.setupNetworkedEntity = this.setupNetworkedEntity.bind(this);

                        this.setupNetworked = function () {
                            NAF.utils.getNetworkedEntity(this.el).then(networkedEl => {
                                this.setupNetworkedEntity(networkedEl);
                            }).catch(() => {
                                this.setupNetworkedEntity();
                            });
                        };
                        this.setupNetworked = this.setupNetworked.bind(this);

                        // This method handles the different startup cases:
                        // - if the GLTF was dropped on the scene, NAF will be connected and we can 
                        //   immediately initialize
                        // - if the GLTF is in the room scene or pinned, it will likely be created
                        //   before NAF is started and connected, so we wait for an event that is
                        //   fired when Hubs has started NAF
                        if (NAF.connection && NAF.connection.isConnected()) {
                            this.setupNetworked();
                        } else {
                            this.el.sceneEl.addEventListener('didConnectToNetworkedScene', this.setupNetworked);
                        }
                    }
                });
            };
            // if attached to a node with a media-loader component, this means we attached this component
            // to a media object in Spoke.  We should wait till the object is fully loaded.  
            // Otherwise, it was attached to something inside a GLTF (probably in blender)
            if (this.el.components["media-loader"]) {
                this.el.addEventListener("media-loaded", () => {
                    loader();
                }, {
                    once: true
                });
            } else {
                loader();
            }
        }
    }
}

function registerSharedAFRAMEComponents(componentName) {
    //
    // Component for our networked state.  This component does nothing except all us to 
    // change the state when appropriate. We could set this up to signal the component above when
    // something has changed, instead of having the component above poll each frame.
    //

    AFRAME.registerComponent(componentName + '-data', {
        schema: {
            sampledata: {
                type: "string",
                default: "{}"
            },
        },
        init: function () {
            this.setSharedData = this.setSharedData.bind(this);

            this.dataObject = this.el.getSharedData();
            try {
                this.sharedData = encodeURIComponent(JSON.stringify(this.dataObject));
                this.el.setAttribute(componentName + "-data", "sampledata", this.sharedData);
            } catch (e) {
                console.error("Couldn't encode initial data object: ", e, this.dataObject);
                this.sharedData = "{}";
                this.dataObject = {};
            }
            this.changed = false;
        },

        update() {
            this.changed = !(this.sharedData === this.data.sampledata);
            if (this.changed) {
                try {
                    this.dataObject = JSON.parse(decodeURIComponent(this.data.sampledata));

                    // do these after the JSON parse to make sure it has succeeded
                    this.sharedData = this.data.sampledata;
                    this.changed = true;
                } catch (e) {
                    console.error("couldn't parse JSON received in data-sync: ", e);
                    this.sharedData = "{}";
                    this.dataObject = {};
                }
            }
        },

        // it is likely that applyPersistentSync only needs to be called for persistent
        // networked entities, so we _probably_ don't need to do this.  But if there is no
        // persistent data saved from the network for this entity, this command does nothing.
        play() {
            if (this.el.components.networked) {
                // not sure if this is really needed, but can't hurt
                if (APP.utils) { // temporary till we ship new client
                    APP.utils.applyPersistentSync(this.el.components.networked.data.networkId);
                }
            }
        },

        setSharedData(dataObject) {
            if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return false;

            try {
                var dataString = encodeURIComponent(JSON.stringify(dataObject));
                this.sharedData = dataString;
                this.dataObject = dataObject;
                this.el.setAttribute(componentName + "-data", "sampledata", dataString);
                return true
            } catch (e) {
                console.error("can't stringify the object passed to data-sync");
                return false
            }
        }
    });

    // Add our template for our networked object to the a-frame assets object,
    // and a schema to the NAF.schemas.  Both must be there to have custom components work

    const assets = document.querySelector("a-assets");

    assets.insertAdjacentHTML(
        'beforeend',
        `
<template id="` + componentName + `-data-media">
  <a-entity
    ` + componentName + `-data
  ></a-entity>
</template>
`
    );

    NAF.schemas.add({
        template: "#" + componentName + "-data-media",
        components: [{
            component: componentName + "-data",
            property: "sampledata"
        }],
        nonAuthorizedComponents: [{
            component: componentName + "-data",
            property: "sampledata"
        }],

    });
}

/**
 * Description
 * ===========
 * create a threejs object (two cubes, one on the surface of the other) that can be interacted 
 * with and has some networked attributes.
 *
 */

///////////////////////////////////////////////////////////////////////////////
// simple convenience functions 
function randomColor() {
    return new THREE.Color(Math.random(), Math.random(), Math.random());
}

function almostEqualVec3(u, v, epsilon) {
    return Math.abs(u.x - v.x) < epsilon && Math.abs(u.y - v.y) < epsilon && Math.abs(u.z - v.z) < epsilon;
}
// a lot of the complexity has been pulled out into methods in the object
// created by interactiveComponentTemplate() and registerSharedAFRAMEcomponents().
// Here, we define methods that are used by the object there, to do our object-specific
// work.

// We need to define:
// - AFRAME 
//   - schema
//   - init() method, which should can startInit() and finishInit()
//   - update() and play() if you need them
//   - tick() and tick2() to handle frame updates
//
// - change isNetworked, isInteractive, isDraggable (default: false) to reflect what 
//   the object needs to do.
// - loadData() is an async function that does any slow work (loading things, etc)
//   and is called by finishInit(), which waits till it's done before setting things up
// - initializeData() is called to set up the initial state of the object, a good 
//   place to create the 3D content.  The three.js scene should be added to 
//   this.simpleContainter
// - clicked() is called when the object is clicked
// - dragStart() is called right after clicked() if isDraggable is true, to set up
//   for a possible drag operation
// - dragEnd() is called when the mouse is released
// - drag() should be called each frame while the object is being dragged (between 
//   dragStart() and dragEnd())
// - getInteractors() returns an array of objects for which interaction controls are
//   intersecting the object. There will likely be zero, one, or two of these (if 
//   there are two controllers and both are pointing at the object).  The "cursor"
//   field is a pointer to the small sphere Object3D that is displayed where the 
//   interaction ray touches the object. The "controller" field is the 
///  corresponding controller
//   object that includes things like the rayCaster.
// - getIntersection() takes in the interactor and the three.js object3D array 
//   that should be tested for interaction.

// Note that only the entity that this component is attached to will be "seen"
// by Hubs interaction system, so the entire three.js tree below it triggers
// click and drag events.  The getIntersection() method is needed 

// the componentName must be lowercase, can have hyphens, start with a letter, 
// but no underscores
let componentName = "test-cube";

// get the template part of the object need for the AFRAME component
let template = interactiveComponentTemplate(componentName);

// create the additional parts of the object needed for the AFRAME component
let child = {
    schema: {
        // name is hopefully unique for each instance
        name: {
            type: "string",
            default: ""
        },

        // the template will look for these properties. If they aren't there, then
        // the lookup (this.data.*) will evaluate to falsey
        isNetworked: {
            type: "boolean",
            default: false
        },
        isInteractive: {
            type: "boolean",
            default: true
        },
        isDraggable: {
            type: "boolean",
            default: true
        },

        // our data
        width: {
            type: "number",
            default: 1
        },
        color: {
            type: "string",
            default: ""
        },
        parameter1: {
            type: "string",
            default: ""
        }
    },

    // fullName is used to generate names for the AFRame objects we create.  Should be
    // unique for each instance of an object, which we specify with name.  If name does
    // name get used as a scheme parameter, it defaults to the name of it's parent glTF
    // object, which only works if those are uniquely named.
    init: function () {
        this.startInit();

        // the template uses these to set things up.  relativeSize
        // is used to set the size of the object relative to the size of the image
        // that it's attached to: a size of 1 means 
        //   "the size of 1x1x1 units in the object
        //    space will be the same as the size of the image".  
        // Larger relative sizes will make the object smaller because we are
        // saying that a size of NxNxN maps to the Size of the image, and vice versa.  
        // For example, if the object below is 2,2 in size and we set size 2, then
        // the object will remain the same size as the image. If we leave it at 1,1,
        // then the object will be twice the size of the image. 
        this.relativeSize = this.data.width;

        // override the defaults in the template
        this.isDraggable = this.data.isDraggable;
        this.isInteractive = this.data.isInteractive;
        this.isNetworked = this.data.isNetworked;

        // our potentiall-shared object state (two roations and two colors for the boxes) 
        this.sharedData = {
            color: new THREE.Color(this.data.color.length > 0 ? this.data.color : "grey"),
            rotation: new THREE.Euler(),
            position: new THREE.Vector3(0,0.5,0)
        };

        // some local state
        this.initialEuler = new THREE.Euler();

        // some click/drag state
        this.clickEvent = null;
        this.clickIntersection = null;

        // we should set fullName if we have a meaningful name
        if (this.data.name && this.data.name.length > 0) {
            this.fullName = this.data.name;
        }

        // finish the initialization
        this.finishInit();
    },

    // if anything changed in this.data, we need to update the object.  
    // this is probably not going to happen, but could if another of 
    // our scripts modifies the component properties in the DOM
    update: function () {},

    // do some stuff to get async data.  Called by initTemplate()
    loadData: async function () {
        return
    },

    // called by initTemplate() when the component is being processed.  Here, we create
    // the three.js objects we want, and add them to simpleContainer (an AFrame node 
    // the template created for us).
    initializeData: function () {
        this.box = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1, 2, 2, 2),
            new THREE.MeshBasicMaterial({
                color: this.sharedData.color
            })
        );
        this.box.matrixAutoUpdate = true;
        this.simpleContainer.setObject3D('box', this.box);

        // create a second small, black box on the surface of the box
        this.box2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.1, 0.1, 2, 2, 2),
            new THREE.MeshBasicMaterial({
                color: "black"
            })
        );
        this.box2.matrixAutoUpdate = true;
        this.box2.position.copy(this.sharedData.position);

        // add it as a child of the first box, since we want it to move with the first box
        this.box.add(this.box2);

        // IMPORTANT: any three.js object that is added to a Hubs (aframe) entity 
        // must have ".el" pointing to the AFRAME Entity that contains it.
        // When an object3D is added with ".setObject3D", it is added to the 
        // object3D for that Entity, and sets all of the children of that
        // object3D to point to the same Entity.  If you add an object3D to
        // the sub-tree of that object later, you must do this yourself. 
        this.box2.el = this.simpleContainer;

        // tell the portals to update their view
        this.el.sceneEl.emit('updatePortals'); 

    },

    // called from remove() in the template to remove any local resources when the component
    // is destroyed
    remove: function () {
        this.simpleContainer.removeObject3D("box");
        this.box.geometry.dispose();
        this.box.material.dispose();
        this.box2.geometry.dispose();
        this.box2.material.dispose();
        this.removeTemplate();
    },

    // handle "interact" events for clickable entities
    clicked: function (evt) {
        // the evt.target will point at the object3D in this entity.  We can use
        // handleInteraction.getInteractionTarget() to get the more precise 
        // hit information about which object3Ds in our object were hit.  We store
        // the one that was clicked here, so we know which it was as we drag around
        this.clickIntersection = this.handleInteraction.getIntersection(evt.object3D, [evt.target]);
        this.clickEvent = evt;

        if (!this.clickIntersection) {
            console.warn("click didn't hit anything; shouldn't happen");
            return;
        }

        if (this.clickIntersection.object == this.box) {
            // new random color on each click
            let newColor = randomColor();

            this.box.material.color.set(newColor);
            this.sharedData.color.set(newColor);
            this.setSharedData();
        } else if (this.clickIntersection.object == this.box2) ;
    },

    // called to start the drag.  Will be called after clicked() if isDraggable is true
    dragStart: function (evt) {
        // set up the drag state
        if (!this.handleInteraction.startDrag(evt, this.clickIntersection.object)) {
            return
        }

        // grab a copy of the current orientation of the object we clicked
        if (this.clickIntersection.object == this.box) {
            this.initialEuler.copy(this.box.rotation);
        } else if (this.clickIntersection.object == this.box2) {
            this.box2.material.color.set("red");
        }
    },

    // called when the button is released to finish the drag
    dragEnd: function (evt) {
        this.handleInteraction.endDrag(evt);
        if (this.clickIntersection.object == this.box) ; else if (this.clickIntersection.object == this.box2) {
            this.box2.material.color.set("black");
        }
    },

    // the method setSharedData() always sets the shared data, causing a network update.  
    // We can be smarter here by calling it only when significant changes happen, 
    // which we'll do in the setSharedEuler methods
    setSharedEuler: function (newEuler) {
        if (!almostEqualVec3(this.sharedData.rotation, newEuler, 0.05)) {
            this.sharedData.rotation.copy(newEuler);
            this.setSharedData();
        }
    },
    setSharedPosition: function (newPos) {
        if (!almostEqualVec3(this.sharedData.position, newPos, 0.05)) {
            this.sharedData.position.copy(newPos);
            this.setSharedData();
        }
    },

    // if the object is networked, this.stateSync will exist and should be called
    setSharedData: function () {
        if (this.stateSync) {
            return this.stateSync.setSharedData(this.sharedData)
        }
        return true
    },

    // this is called from the networked data entity to get the initial data 
    // from the component
    getSharedData: function () {
        return this.sharedData
    },

    // per frame stuff
    tick: function (time) {
        if (!this.box) {
            // haven't finished initializing yet
            return;
        }

        // if it's interactive, we'll handle drag and hover events
        if (this.isInteractive) {

            // if we're dragging, update the rotation
            if (this.isDraggable && this.handleInteraction.isDragging) {

                // do something with the dragging. Here, we'll use delta.x and delta.y
                // to rotate the object.  These values are set as a relative offset in
                // the plane perpendicular to the view, so we'll use them to offset the
                // x and y rotation of the object.  This is a TERRIBLE way to do rotate,
                // but it's a simple example.
                if (this.clickIntersection.object == this.box) {
                    // update drag state
                    this.handleInteraction.drag();

                    // compute a new rotation based on the delta
                    this.box.rotation.set(this.initialEuler.x - this.handleInteraction.delta.x,
                        this.initialEuler.y + this.handleInteraction.delta.y,
                        this.initialEuler.z);

                    // update the shared rotation
                    this.setSharedEuler(this.box.rotation);
                } else if (this.clickIntersection.object == this.box2) {

                    // we want to hit test on our boxes, but only want to know if/where
                    // we hit the big box.  So first hide the small box, and then do a
                    // a hit test, which can only result in a hit on the big box.  
                    this.box2.visible = false;
                    let intersect = this.handleInteraction.getIntersection(this.handleInteraction.dragInteractor, [this.box]);
                    this.box2.visible = true;

                    // if we hit the big box, move the small box to the position of the hit
                    if (intersect) {
                        // the intersect object is a THREE.Intersection object, which has the hit point
                        // specified in world coordinates.  So we move those coordinates into the local
                        // coordiates of the big box, and then set the position of the small box to that
                        let position = this.box.worldToLocal(intersect.point);
                        this.box2.position.copy(position);
                        this.setSharedPosition(this.box2.position);
                    }
                }
            } else {
                // do something with the rays when not dragging or clicking.
                // For example, we could display some additional content when hovering
                let passthruInteractor = this.handleInteraction.getInteractors(this.simpleContainer);

                // we will set yellow if either interactor hits the box. We'll keep track of if
                // one does
                let setIt = false;

                // for each of our interactors, check if it hits the scene
                for (let i = 0; i < passthruInteractor.length; i++) {
                    let intersection = this.handleInteraction.getIntersection(passthruInteractor[i], this.simpleContainer.object3D.children);

                    // if we hit the small box, set the color to yellow, and flag that we hit
                    if (intersection && intersection.object === this.box2) {
                        this.box2.material.color.set("yellow");
                        setIt = true;
                    }
                }

                // if we didn't hit, make sure the color remains black
                if (!setIt) {
                    this.box2.material.color.set("black");
                }
            }
        }

        if (this.isNetworked) {
            // if we haven't finished setting up the networked entity don't do anything.
            if (!this.netEntity || !this.stateSync) {
                return
            }

            // if the state has changed in the networked data, update our html object
            if (this.stateSync.changed) {
                this.stateSync.changed = false;

                // got the data, now do something with it
                let newData = this.stateSync.dataObject;
                this.sharedData.color.set(newData.color);
                this.sharedData.rotation.copy(newData.rotation);
                this.sharedData.position.copy(newData.position);
                this.box.material.color.set(newData.color);
                this.box.rotation.copy(newData.rotation);
                this.box2.position.copy(newData.position);
            }
        }
    }
};

// register the component with the AFrame scene
AFRAME.registerComponent(componentName, {
    ...child,
    ...template
});

// create and register the data component and it's NAF component with the AFrame scene
registerSharedAFRAMEComponents(componentName);

const worldCameraPos = new THREE.Vector3();  

AFRAME.registerComponent('show-hide', {
    schema: {
        radius: { type: 'number', default: 1 },
        showClose: { type: 'boolean', default: true },
    },

    init: function () {
        this.innerRadius = this.data.radius * 0.95;
        this.outerRadius = this.data.radius * 1.05;
    },

    tick: function (time) {
        this.el.sceneEl.camera.getWorldPosition(worldCameraPos);
        this.el.object3D.worldToLocal(worldCameraPos);

        let l = worldCameraPos.length();
        if (l < this.innerRadius) {
            this.el.object3D.visible = this.data.showClose;
        } else if (l > this.outerRadius) {
            this.el.object3D.visible = !this.data.showClose;
        }
    }
});

AFRAME.GLTFModelPlus.registerComponent('immersive-360', 'immersive-360');
AFRAME.GLTFModelPlus.registerComponent('portal', 'portal');
AFRAME.GLTFModelPlus.registerComponent('shader', 'shader');
AFRAME.GLTFModelPlus.registerComponent('parallax', 'parallax');
AFRAME.GLTFModelPlus.registerComponent('html-script', 'html-script');
AFRAME.GLTFModelPlus.registerComponent('region-hider', 'region-hider');
AFRAME.GLTFModelPlus.registerComponent('video-control-pad', 'video-control-pad');
AFRAME.GLTFModelPlus.registerComponent('show-hide', 'show-hide');
AFRAME.GLTFModelPlus.registerComponent('test-cube', 'test-cube');
AFRAME.GLTFModelPlus.registerComponent('test-cube', 'test-cube');
// do a simple monkey patch to see if it works
// var myisMineOrLocal = function (that) {
//     return !that.el.components.networked || (that.networkedEl && NAF.utils.isMine(that.networkedEl));
//  }
//  var videoComp = AFRAME.components["media-video"]
//  videoComp.Component.prototype.isMineOrLocal = myisMineOrLocal;
// add the region-hider to the scene
// const scene = document.querySelector("a-scene");
// scene.setAttribute("region-hider", {size: 100})
function hideLobbySphere() {
    // @ts-ignore
    window.APP.scene.addEventListener('stateadded', function (evt) {
        if (evt.detail === 'entered') {
            // @ts-ignore
            var lobbySphere = window.APP.scene.object3D.getObjectByName('lobbySphere');
            if (lobbySphere) {
                lobbySphere.visible = false;
            }
        }
    });
}
if (document.readyState === 'complete') {
    hideLobbySphere();
}
else {
    document.addEventListener('DOMContentLoaded', hideLobbySphere);
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi1yb29tLmpzIiwic291cmNlcyI6WyIuLi9zcmMvc3lzdGVtcy9mYWRlci1wbHVzLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcHJveGltaXR5LWV2ZW50cy5qcyIsIi4uL3NyYy91dGlscy9jb21wb25lbnQtdXRpbHMuanMiLCIuLi9zcmMvdXRpbHMvc2NlbmUtZ3JhcGgudHMiLCIuLi9zcmMvY29tcG9uZW50cy9yZWdpb24taGlkZXIuanMiLCIuLi9zcmMvdXRpbHMvZGVmYXVsdEhvb2tzLnRzIiwiLi4vc3JjL3V0aWxzL01hdGVyaWFsTW9kaWZpZXIudHMiLCIuLi9zcmMvc2hhZGVycy9zaGFkZXJUb3lNYWluLnRzIiwiLi4vc3JjL3NoYWRlcnMvc2hhZGVyVG95VW5pZm9ybU9iai50cyIsIi4uL3NyYy9zaGFkZXJzL3NoYWRlclRveVVuaWZvcm1fcGFyYXMudHMiLCIuLi9zcmMvYXNzZXRzL2JheWVyLnBuZyIsIi4uL3NyYy9zaGFkZXJzL2JsZWVweS1ibG9ja3Mtc2hhZGVyLnRzIiwiLi4vc3JjL3NoYWRlcnMvbm9pc2UudHMiLCIuLi9zcmMvc2hhZGVycy9saXF1aWQtbWFyYmxlLnRzIiwiLi4vc3JjL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmciLCIuLi9zcmMvc2hhZGVycy9nYWxheHkudHMiLCIuLi9zcmMvc2hhZGVycy9sYWNlLXR1bm5lbC50cyIsIi4uL3NyYy9hc3NldHMvbm9pc2UtMjU2LnBuZyIsIi4uL3NyYy9zaGFkZXJzL2ZpcmUtdHVubmVsLnRzIiwiLi4vc3JjL3NoYWRlcnMvbWlzdC50cyIsIi4uL3NyYy9zaGFkZXJzL21hcmJsZTEudHMiLCIuLi9zcmMvYXNzZXRzL2JhZFNoYWRlci5qcGciLCIuLi9zcmMvc2hhZGVycy9ub3QtZm91bmQudHMiLCIuLi9zcmMvYXNzZXRzL3dhcnBmeC5wbmciLCIuLi9zcmMvc2hhZGVycy93YXJwLnRzIiwiLi4vc3JjL3NoYWRlcnMvc25vaXNlLnRzIiwiLi4vc3JjL3NoYWRlcnMvaW52ZXJzZS50cyIsIi4uL3NyYy9zaGFkZXJzL3dhcnAtcG9ydGFsLnRzIiwiLi4vc3JjL2NvbXBvbmVudHMvc2hhZGVyLnRzIiwiLi4vc3JjL3V0aWxzL3V0aWxzLmpzIiwiLi4vc3JjL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX0NPTE9SLmpwZyIsIi4uL3NyYy9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9ESVNQLmpwZyIsIi4uL3NyYy9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9nbG9zc2luZXNzLnBuZyIsIi4uL3NyYy9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9OUk0uanBnIiwiLi4vc3JjL2Fzc2V0cy9NZXRhbF9Hb2xkX0ZvaWxfMDAyX09DQy5qcGciLCIuLi9zcmMvdXRpbHMvd3JpdGVDdWJlTWFwLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcG9ydGFsLmpzIiwiLi4vc3JjL2Fzc2V0cy9iYWxsZngucG5nIiwiLi4vc3JjL3NoYWRlcnMvcGFub2JhbGwudmVydC5qcyIsIi4uL3NyYy9zaGFkZXJzL3Bhbm9iYWxsLmZyYWcuanMiLCIuLi9zcmMvY29tcG9uZW50cy9pbW1lcnNpdmUtMzYwLmpzIiwiLi4vc3JjL3NoYWRlcnMvcGFyYWxsYXgtc2hhZGVyLmpzIiwiLi4vc3JjL2NvbXBvbmVudHMvcGFyYWxsYXguanMiLCIuLi9zcmMvYXNzZXRzL1NwaW5uZXItMXMtMjAwcHgucG5nIiwiLi4vc3JjL2NvbXBvbmVudHMvaHRtbC1zY3JpcHQuanMiLCIuLi9zcmMvY29tcG9uZW50cy92aWRlby1jb250cm9sLXBhZC50cyIsIi4uL3NyYy91dGlscy90aHJlZS11dGlscy5qcyIsIi4uL3NyYy91dGlscy9pbnRlcmFjdGlvbi5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3RocmVlLXNhbXBsZS5qcyIsIi4uL3NyYy9jb21wb25lbnRzL3Nob3ctaGlkZS5qcyIsIi4uL3NyYy9yb29tcy9tYWluLXJvb20udHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBNb2RpZmllZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL2h1YnMvYmxvYi9tYXN0ZXIvc3JjL2NvbXBvbmVudHMvZmFkZXIuanNcbiAqIHRvIGluY2x1ZGUgYWRqdXN0YWJsZSBkdXJhdGlvbiBhbmQgY29udmVydGVkIGZyb20gY29tcG9uZW50IHRvIHN5c3RlbVxuICovXG5cbkFGUkFNRS5yZWdpc3RlclN5c3RlbSgnZmFkZXItcGx1cycsIHtcbiAgc2NoZW1hOiB7XG4gICAgZGlyZWN0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiAnbm9uZScgfSwgLy8gXCJpblwiLCBcIm91dFwiLCBvciBcIm5vbmVcIlxuICAgIGR1cmF0aW9uOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAyMDAgfSwgLy8gVHJhbnNpdGlvbiBkdXJhdGlvbiBpbiBtaWxsaXNlY29uZHNcbiAgICBjb2xvcjogeyB0eXBlOiAnY29sb3InLCBkZWZhdWx0OiAnd2hpdGUnIH0sXG4gIH0sXG5cbiAgaW5pdCgpIHtcbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoKSxcbiAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XG4gICAgICAgIGNvbG9yOiB0aGlzLmRhdGEuY29sb3IsXG4gICAgICAgIHNpZGU6IFRIUkVFLkJhY2tTaWRlLFxuICAgICAgICBvcGFjaXR5OiAwLFxuICAgICAgICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICAgICAgZm9nOiBmYWxzZSxcbiAgICAgIH0pXG4gICAgKVxuICAgIG1lc2guc2NhbGUueCA9IG1lc2guc2NhbGUueSA9IDFcbiAgICBtZXNoLnNjYWxlLnogPSAwLjE1XG4gICAgbWVzaC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWVcbiAgICBtZXNoLnJlbmRlck9yZGVyID0gMSAvLyByZW5kZXIgYWZ0ZXIgb3RoZXIgdHJhbnNwYXJlbnQgc3R1ZmZcbiAgICB0aGlzLmVsLmNhbWVyYS5hZGQobWVzaClcbiAgICB0aGlzLm1lc2ggPSBtZXNoXG4gIH0sXG5cbiAgZmFkZU91dCgpIHtcbiAgICByZXR1cm4gdGhpcy5iZWdpblRyYW5zaXRpb24oJ291dCcpXG4gIH0sXG5cbiAgZmFkZUluKCkge1xuICAgIHJldHVybiB0aGlzLmJlZ2luVHJhbnNpdGlvbignaW4nKVxuICB9LFxuXG4gIGFzeW5jIGJlZ2luVHJhbnNpdGlvbihkaXJlY3Rpb24pIHtcbiAgICBpZiAodGhpcy5fcmVzb2x2ZUZpbmlzaCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZmFkZSB3aGlsZSBhIGZhZGUgaXMgaGFwcGVuaW5nLicpXG4gICAgfVxuXG4gICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2ZhZGVyLXBsdXMnLCB7IGRpcmVjdGlvbiB9KVxuXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXMpID0+IHtcbiAgICAgIGlmICh0aGlzLm1lc2gubWF0ZXJpYWwub3BhY2l0eSA9PT0gKGRpcmVjdGlvbiA9PSAnaW4nID8gMCA6IDEpKSB7XG4gICAgICAgIHJlcygpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9yZXNvbHZlRmluaXNoID0gcmVzXG4gICAgICB9XG4gICAgfSlcbiAgfSxcblxuICB0aWNrKHQsIGR0KSB7XG4gICAgY29uc3QgbWF0ID0gdGhpcy5tZXNoLm1hdGVyaWFsXG4gICAgdGhpcy5tZXNoLnZpc2libGUgPSB0aGlzLmRhdGEuZGlyZWN0aW9uID09PSAnb3V0JyB8fCBtYXQub3BhY2l0eSAhPT0gMFxuICAgIGlmICghdGhpcy5tZXNoLnZpc2libGUpIHJldHVyblxuXG4gICAgaWYgKHRoaXMuZGF0YS5kaXJlY3Rpb24gPT09ICdpbicpIHtcbiAgICAgIG1hdC5vcGFjaXR5ID0gTWF0aC5tYXgoMCwgbWF0Lm9wYWNpdHkgLSAoMS4wIC8gdGhpcy5kYXRhLmR1cmF0aW9uKSAqIE1hdGgubWluKGR0LCA1MCkpXG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuZGlyZWN0aW9uID09PSAnb3V0Jykge1xuICAgICAgbWF0Lm9wYWNpdHkgPSBNYXRoLm1pbigxLCBtYXQub3BhY2l0eSArICgxLjAgLyB0aGlzLmRhdGEuZHVyYXRpb24pICogTWF0aC5taW4oZHQsIDUwKSlcbiAgICB9XG5cbiAgICBpZiAobWF0Lm9wYWNpdHkgPT09IDAgfHwgbWF0Lm9wYWNpdHkgPT09IDEpIHtcbiAgICAgIGlmICh0aGlzLmRhdGEuZGlyZWN0aW9uICE9PSAnbm9uZScpIHtcbiAgICAgICAgaWYgKHRoaXMuX3Jlc29sdmVGaW5pc2gpIHtcbiAgICAgICAgICB0aGlzLl9yZXNvbHZlRmluaXNoKClcbiAgICAgICAgICB0aGlzLl9yZXNvbHZlRmluaXNoID0gbnVsbFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdmYWRlci1wbHVzJywgeyBkaXJlY3Rpb246ICdub25lJyB9KVxuICAgIH1cbiAgfSxcbn0pXG4iLCJjb25zdCB3b3JsZENhbWVyYSA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkU2VsZiA9IG5ldyBUSFJFRS5WZWN0b3IzKClcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdwcm94aW1pdHktZXZlbnRzJywge1xuICBzY2hlbWE6IHtcbiAgICByYWRpdXM6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDEgfSxcbiAgICBmdXp6OiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAwLjEgfSxcbiAgICBZb2Zmc2V0OiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAwIH0sXG4gIH0sXG4gIGluaXQoKSB7XG4gICAgdGhpcy5pblpvbmUgPSBmYWxzZVxuICAgIHRoaXMuY2FtZXJhID0gdGhpcy5lbC5zY2VuZUVsLmNhbWVyYVxuICB9LFxuICB0aWNrKCkge1xuICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24od29ybGRDYW1lcmEpXG4gICAgdGhpcy5lbC5vYmplY3QzRC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkU2VsZilcbiAgICBjb25zdCB3YXNJbnpvbmUgPSB0aGlzLmluWm9uZVxuXG4gICAgd29ybGRDYW1lcmEueSAtPSB0aGlzLmRhdGEuWW9mZnNldFxuICAgIHZhciBkaXN0ID0gd29ybGRDYW1lcmEuZGlzdGFuY2VUbyh3b3JsZFNlbGYpXG4gICAgdmFyIHRocmVzaG9sZCA9IHRoaXMuZGF0YS5yYWRpdXMgKyAodGhpcy5pblpvbmUgPyB0aGlzLmRhdGEuZnV6eiAgOiAwKVxuICAgIHRoaXMuaW5ab25lID0gZGlzdCA8IHRocmVzaG9sZFxuICAgIGlmICh0aGlzLmluWm9uZSAmJiAhd2FzSW56b25lKSB0aGlzLmVsLmVtaXQoJ3Byb3hpbWl0eWVudGVyJylcbiAgICBpZiAoIXRoaXMuaW5ab25lICYmIHdhc0luem9uZSkgdGhpcy5lbC5lbWl0KCdwcm94aW1pdHlsZWF2ZScpXG4gIH0sXG59KVxuIiwiLy8gUHJvdmlkZXMgYSBnbG9iYWwgcmVnaXN0cnkgb2YgcnVubmluZyBjb21wb25lbnRzXG4vLyBjb3BpZWQgZnJvbSBodWJzIHNvdXJjZVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZShjb21wb25lbnQsIG5hbWUpIHtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5ID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeSB8fCB7fTtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdID0gd2luZG93LkFQUC5jb21wb25lbnRSZWdpc3RyeVtuYW1lXSB8fCBbXTtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdLnB1c2goY29tcG9uZW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZShjb21wb25lbnQsIG5hbWUpIHtcbiAgICBpZiAoIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkgfHwgIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbbmFtZV0pIHJldHVybjtcbiAgICB3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdLnNwbGljZSh3aW5kb3cuQVBQLmNvbXBvbmVudFJlZ2lzdHJ5W25hbWVdLmluZGV4T2YoY29tcG9uZW50KSwgMSk7XG59XG4gICIsIi8vIGNvcGllZCBmcm9tIGh1YnNcbmltcG9ydCB7IEVudGl0eSwgQ29tcG9uZW50IH0gZnJvbSAnYWZyYW1lJ1xuXG5leHBvcnQgZnVuY3Rpb24gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudChlbnRpdHk6IEVudGl0eSwgY29tcG9uZW50TmFtZTogc3RyaW5nKTogRW50aXR5IHwgbnVsbCB7XG4gICAgd2hpbGUgKGVudGl0eSAmJiAhKGVudGl0eS5jb21wb25lbnRzICYmIGVudGl0eS5jb21wb25lbnRzW2NvbXBvbmVudE5hbWVdKSkge1xuICAgICAgZW50aXR5ID0gKGVudGl0eS5wYXJlbnROb2RlIGFzIEVudGl0eSk7XG4gICAgfVxuICAgIHJldHVybiBlbnRpdHk7XG4gIH1cbiAgXG4gIGV4cG9ydCBmdW5jdGlvbiBmaW5kQ29tcG9uZW50c0luTmVhcmVzdEFuY2VzdG9yKGVudGl0eTogRW50aXR5LCBjb21wb25lbnROYW1lOiBzdHJpbmcpOiBDb21wb25lbnRbXSB7XG4gICAgY29uc3QgY29tcG9uZW50cyA9IFtdO1xuICAgIHdoaWxlIChlbnRpdHkpIHtcbiAgICAgIGlmIChlbnRpdHkuY29tcG9uZW50cykge1xuICAgICAgICBmb3IgKGNvbnN0IGMgaW4gZW50aXR5LmNvbXBvbmVudHMpIHtcbiAgICAgICAgICBpZiAoZW50aXR5LmNvbXBvbmVudHNbY10ubmFtZSA9PT0gY29tcG9uZW50TmFtZSkge1xuICAgICAgICAgICAgY29tcG9uZW50cy5wdXNoKGVudGl0eS5jb21wb25lbnRzW2NdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjb21wb25lbnRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gY29tcG9uZW50cztcbiAgICAgIH1cbiAgICAgIGVudGl0eSA9IGVudGl0eS5wYXJlbnROb2RlIGFzIEVudGl0eTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbXBvbmVudHM7XG4gIH1cbiAgIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIGJyZWFrIHRoZSByb29tIGludG8gcXVhZHJhbnRzIG9mIGEgY2VydGFpbiBzaXplLCBhbmQgaGlkZSB0aGUgY29udGVudHMgb2YgYXJlYXMgdGhhdCBoYXZlXG4gKiBub2JvZHkgaW4gdGhlbS4gIE1lZGlhIHdpbGwgYmUgcGF1c2VkIGluIHRob3NlIGFyZWFzIHRvby5cbiAqIFxuICogSW5jbHVkZSBhIHdheSBmb3IgdGhlIHBvcnRhbCBjb21wb25lbnQgdG8gdHVybiBvbiBlbGVtZW50cyBpbiB0aGUgcmVnaW9uIG9mIHRoZSBwb3J0YWwgYmVmb3JlXG4gKiBpdCBjYXB0dXJlcyBhIGN1YmVtYXBcbiAqL1xuXG5pbXBvcnQgeyByZWdpc3RlckNvbXBvbmVudEluc3RhbmNlLCBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UgfSBmcm9tIFwiLi4vdXRpbHMvY29tcG9uZW50LXV0aWxzXCI7XG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSBcIi4uL3V0aWxzL3NjZW5lLWdyYXBoXCI7XG5cbiAvLyBhcmJpdHJhcmlseSBjaG9vc2UgMTAwMDAwMCBhcyB0aGUgbnVtYmVyIG9mIGNvbXB1dGVkIHpvbmVzIGluICB4IGFuZCB5XG5sZXQgTUFYX1pPTkVTID0gMTAwMDAwMFxubGV0IHJlZ2lvblRhZyA9IGZ1bmN0aW9uKHNpemUsIG9iajNkKSB7XG4gICAgbGV0IHBvcyA9IG9iajNkLnBvc2l0aW9uXG4gICAgbGV0IHhwID0gTWF0aC5mbG9vcihwb3MueCAvIHNpemUpICsgTUFYX1pPTkVTLzJcbiAgICBsZXQgenAgPSBNYXRoLmZsb29yKHBvcy56IC8gc2l6ZSkgKyBNQVhfWk9ORVMvMlxuICAgIHJldHVybiBNQVhfWk9ORVMgKiB4cCArIHpwXG59XG5cbmxldCByZWdpb25zSW5Vc2UgPSBbXVxuXG4vKipcbiAqIEZpbmQgdGhlIGNsb3Nlc3QgYW5jZXN0b3IgKGluY2x1ZGluZyB0aGUgcGFzc2VkIGluIGVudGl0eSkgdGhhdCBoYXMgYW4gYG9iamVjdC1yZWdpb24tZm9sbG93ZXJgIGNvbXBvbmVudCxcbiAqIGFuZCByZXR1cm4gdGhhdCBjb21wb25lbnRcbiAqL1xuZnVuY3Rpb24gZ2V0UmVnaW9uRm9sbG93ZXIoZW50aXR5KSB7XG4gICAgbGV0IGN1ckVudGl0eSA9IGVudGl0eTtcbiAgXG4gICAgd2hpbGUoY3VyRW50aXR5ICYmIGN1ckVudGl0eS5jb21wb25lbnRzICYmICFjdXJFbnRpdHkuY29tcG9uZW50c1tcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl0pIHtcbiAgICAgICAgY3VyRW50aXR5ID0gY3VyRW50aXR5LnBhcmVudE5vZGU7XG4gICAgfVxuICBcbiAgICBpZiAoIWN1ckVudGl0eSB8fCAhY3VyRW50aXR5LmNvbXBvbmVudHMgfHwgIWN1ckVudGl0eS5jb21wb25lbnRzW1wib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiXSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBjdXJFbnRpdHkuY29tcG9uZW50c1tcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIl1cbn1cbiAgXG5mdW5jdGlvbiBhZGRUb1JlZ2lvbihyZWdpb24pIHtcbiAgICByZWdpb25zSW5Vc2VbcmVnaW9uXSA/IHJlZ2lvbnNJblVzZVtyZWdpb25dKysgOiByZWdpb25zSW5Vc2VbcmVnaW9uXSA9IDFcbiAgICBjb25zb2xlLmxvZyhcIkF2YXRhcnMgaW4gcmVnaW9uIFwiICsgcmVnaW9uICsgXCI6IFwiICsgcmVnaW9uc0luVXNlW3JlZ2lvbl0pXG4gICAgaWYgKHJlZ2lvbnNJblVzZVtyZWdpb25dID09IDEpIHtcbiAgICAgICAgc2hvd0hpZGVPYmplY3RzSW5SZWdpb24ocmVnaW9uLCB0cnVlKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiYWxyZWFkeSBhbm90aGVyIGF2YXRhciBpbiB0aGlzIHJlZ2lvbiwgbm8gY2hhbmdlXCIpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBzdWJ0cmFjdEZyb21SZWdpb24ocmVnaW9uKSB7XG4gICAgaWYgKHJlZ2lvbnNJblVzZVtyZWdpb25dKSB7cmVnaW9uc0luVXNlW3JlZ2lvbl0tLSB9XG4gICAgY29uc29sZS5sb2coXCJBdmF0YXJzIGxlZnQgcmVnaW9uIFwiICsgcmVnaW9uICsgXCI6IFwiICsgcmVnaW9uc0luVXNlW3JlZ2lvbl0pXG5cbiAgICBpZiAocmVnaW9uc0luVXNlW3JlZ2lvbl0gPT0gMCkge1xuICAgICAgICBzaG93SGlkZU9iamVjdHNJblJlZ2lvbihyZWdpb24sIGZhbHNlKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwic3RpbGwgYW5vdGhlciBhdmF0YXIgaW4gdGhpcyByZWdpb24sIG5vIGNoYW5nZVwiKVxuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3dSZWdpb25Gb3JPYmplY3QoZWxlbWVudCkge1xuICAgIGxldCBmb2xsb3dlciA9IGdldFJlZ2lvbkZvbGxvd2VyKGVsZW1lbnQpXG4gICAgaWYgKCFmb2xsb3dlcikgeyByZXR1cm4gfVxuXG4gICAgY29uc29sZS5sb2coXCJzaG93aW5nIG9iamVjdHMgbmVhciBcIiArIGZvbGxvd2VyLmVsLmNsYXNzTmFtZSlcblxuICAgIGFkZFRvUmVnaW9uKGZvbGxvd2VyLnJlZ2lvbilcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhpZGVyUmVnaW9uRm9yT2JqZWN0KGVsZW1lbnQpIHtcbiAgICBsZXQgZm9sbG93ZXIgPSBnZXRSZWdpb25Gb2xsb3dlcihlbGVtZW50KVxuICAgIGlmICghZm9sbG93ZXIpIHsgcmV0dXJuIH1cblxuICAgIGNvbnNvbGUubG9nKFwiaGlkaW5nIG9iamVjdHMgbmVhciBcIiArIGZvbGxvd2VyLmVsLmNsYXNzTmFtZSlcblxuICAgIHN1YnRyYWN0RnJvbVJlZ2lvbihmb2xsb3dlci5yZWdpb24pXG59XG5cbmZ1bmN0aW9uIHNob3dIaWRlT2JqZWN0cygpIHtcbiAgICBpZiAoIXdpbmRvdy5BUFAgfHwgIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkpXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIGNvbnNvbGUubG9nIChcInNob3dpbmcvaGlkaW5nIGFsbCBvYmplY3RzXCIpXG4gICAgY29uc3Qgb2JqZWN0cyA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdIHx8IFtdO1xuICBcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG9iamVjdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IG9iaiA9IG9iamVjdHNbaV07XG4gICAgICBcbiAgICAgIGxldCB2aXNpYmxlID0gcmVnaW9uc0luVXNlW29iai5yZWdpb25dID8gdHJ1ZTogZmFsc2VcbiAgICAgICAgXG4gICAgICBpZiAob2JqLmVsLm9iamVjdDNELnZpc2libGUgPT0gdmlzaWJsZSkgeyBjb250aW51ZSB9XG5cbiAgICAgIGNvbnNvbGUubG9nICgodmlzaWJsZSA/IFwic2hvd2luZyBcIiA6IFwiaGlkaW5nIFwiKSArIG9iai5lbC5jbGFzc05hbWUpXG4gICAgICBvYmouc2hvd0hpZGUodmlzaWJsZSlcbiAgICB9XG4gIFxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBzaG93SGlkZU9iamVjdHNJblJlZ2lvbihyZWdpb24sIHZpc2libGUpIHtcbiAgICBpZiAoIXdpbmRvdy5BUFAgfHwgIXdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnkpXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIGNvbnNvbGUubG9nICgodmlzaWJsZSA/IFwic2hvd2luZ1wiIDogXCJoaWRpbmdcIikgKyBcIiBhbGwgb2JqZWN0cyBpbiByZWdpb24gXCIgKyByZWdpb24pXG4gICAgY29uc3Qgb2JqZWN0cyA9IHdpbmRvdy5BUFAuY29tcG9uZW50UmVnaXN0cnlbXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCJdIHx8IFtdO1xuICBcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG9iamVjdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IG9iaiA9IG9iamVjdHNbaV07XG4gICAgICBcbiAgICAgIGlmIChvYmoucmVnaW9uID09IHJlZ2lvbikge1xuICAgICAgICBjb25zb2xlLmxvZyAoKHZpc2libGUgPyBcInNob3dpbmcgXCIgOiBcIiBoaWRpbmdcIikgKyBvYmouZWwuY2xhc3NOYW1lKVxuICAgICAgICBvYmouc2hvd0hpZGUodmlzaWJsZSlcbiAgICAgIH1cbiAgICB9XG4gIFxuICAgIHJldHVybiBudWxsO1xufVxuICBcbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnYXZhdGFyLXJlZ2lvbi1mb2xsb3dlcicsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2l6ZTogeyBkZWZhdWx0OiAxMCB9XG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMucmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuICAgICAgICBjb25zb2xlLmxvZyhcIkF2YXRhcjogcmVnaW9uIFwiLCB0aGlzLnJlZ2lvbilcbiAgICAgICAgYWRkVG9SZWdpb24odGhpcy5yZWdpb24pXG5cbiAgICAgICAgcmVnaXN0ZXJDb21wb25lbnRJbnN0YW5jZSh0aGlzLCBcImF2YXRhci1yZWdpb24tZm9sbG93ZXJcIik7XG4gICAgfSxcbiAgICByZW1vdmU6IGZ1bmN0aW9uKCkge1xuICAgICAgICBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgICAgICBzdWJ0cmFjdEZyb21SZWdpb24odGhpcy5yZWdpb24pXG4gICAgfSxcblxuICAgIHRpY2s6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgbGV0IG5ld1JlZ2lvbiA9IHJlZ2lvblRhZyh0aGlzLmRhdGEuc2l6ZSwgdGhpcy5lbC5vYmplY3QzRClcbiAgICAgICAgaWYgKG5ld1JlZ2lvbiAhPSB0aGlzLnJlZ2lvbikge1xuICAgICAgICAgICAgc3VidHJhY3RGcm9tUmVnaW9uKHRoaXMucmVnaW9uKVxuICAgICAgICAgICAgYWRkVG9SZWdpb24obmV3UmVnaW9uKVxuICAgICAgICAgICAgdGhpcy5yZWdpb24gPSBuZXdSZWdpb25cbiAgICAgICAgfVxuICAgIH0sXG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ29iamVjdC1yZWdpb24tZm9sbG93ZXInLCB7XG4gICAgc2NoZW1hOiB7XG4gICAgICAgIHNpemU6IHsgZGVmYXVsdDogMTAgfSxcbiAgICAgICAgZHluYW1pYzogeyBkZWZhdWx0OiB0cnVlIH1cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZWdpb24gPSByZWdpb25UYWcodGhpcy5kYXRhLnNpemUsIHRoaXMuZWwub2JqZWN0M0QpXG5cbiAgICAgICAgdGhpcy5zaG93SGlkZSA9IHRoaXMuc2hvd0hpZGUuYmluZCh0aGlzKVxuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0pIHtcbiAgICAgICAgICAgIHRoaXMud2FzUGF1c2VkID0gdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0uZGF0YS52aWRlb1BhdXNlZFxuICAgICAgICB9XG4gICAgICAgIHJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgIH0sXG5cbiAgICByZW1vdmU6IGZ1bmN0aW9uKCkge1xuICAgICAgICBkZXJlZ2lzdGVyQ29tcG9uZW50SW5zdGFuY2UodGhpcywgXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIpO1xuICAgIH0sXG5cbiAgICB0aWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIG9iamVjdHMgaW4gdGhlIGVudmlyb25tZW50IHNjZW5lIGRvbid0IG1vdmVcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEuZHluYW1pYykgeyByZXR1cm4gfVxuXG4gICAgICAgIHRoaXMucmVnaW9uID0gcmVnaW9uVGFnKHRoaXMuZGF0YS5zaXplLCB0aGlzLmVsLm9iamVjdDNEKVxuXG4gICAgICAgIGxldCB2aXNpYmxlID0gcmVnaW9uc0luVXNlW3RoaXMucmVnaW9uXSA/IHRydWU6IGZhbHNlXG4gICAgICAgIFxuICAgICAgICBpZiAodGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID09IHZpc2libGUpIHsgcmV0dXJuIH1cblxuICAgICAgICAvLyBoYW5kbGUgc2hvdy9oaWRpbmcgdGhlIG9iamVjdHNcbiAgICAgICAgdGhpcy5zaG93SGlkZSh2aXNpYmxlKVxuICAgIH0sXG5cbiAgICBzaG93SGlkZTogZnVuY3Rpb24gKHZpc2libGUpIHtcbiAgICAgICAgLy8gaGFuZGxlIHNob3cvaGlkaW5nIHRoZSBvYmplY3RzXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9IHZpc2libGVcblxuICAgICAgICAvLy8gY2hlY2sgZm9yIG1lZGlhLXZpZGVvIGNvbXBvbmVudCBvbiBwYXJlbnQgdG8gc2VlIGlmIHdlJ3JlIGEgdmlkZW8uICBBbHNvIHNhbWUgZm9yIGF1ZGlvXG4gICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXSkge1xuICAgICAgICAgICAgaWYgKHZpc2libGUpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy53YXNQYXVzZWQgIT0gdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl0uZGF0YS52aWRlb1BhdXNlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS12aWRlb1wiXS50b2dnbGVQbGF5aW5nKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLndhc1BhdXNlZCA9IHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLmRhdGEudmlkZW9QYXVzZWRcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMud2FzUGF1c2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdLnRvZ2dsZVBsYXlpbmcoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ3JlZ2lvbi1oaWRlcicsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgLy8gbmFtZSBtdXN0IGZvbGxvdyB0aGUgcGF0dGVybiBcIipfY29tcG9uZW50TmFtZVwiXG4gICAgICAgIHNpemU6IHsgZGVmYXVsdDogMTAgfVxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBJZiB0aGVyZSBpcyBhIHBhcmVudCB3aXRoIFwibmF2LW1lc2gtaGVscGVyXCIsIHRoaXMgaXMgaW4gdGhlIHNjZW5lLiAgXG4gICAgICAgIC8vIElmIG5vdCwgaXQncyBpbiBhbiBvYmplY3Qgd2UgZHJvcHBlZCBvbiB0aGUgd2luZG93LCB3aGljaCB3ZSBkb24ndCBzdXBwb3J0XG4gICAgICAgIGlmICghZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcIm5hdi1tZXNoLWhlbHBlclwiKSkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicmVnaW9uLWhpZGVyIGNvbXBvbmVudCBtdXN0IGJlIGluIHRoZSBlbnZpcm9ubWVudCBzY2VuZSBnbGIuXCIpXG4gICAgICAgICAgICB0aGlzLnNpemUgPSAwO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZih0aGlzLmRhdGEuc2l6ZSA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGEuc2l6ZSA9IDEwO1xuICAgICAgICAgICAgdGhpcy5zaXplID0gdGhpcy5wYXJzZU5vZGVOYW1lKHRoaXMuZGF0YS5zaXplKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRoaXMubmV3U2NlbmUgPSB0aGlzLm5ld1NjZW5lLmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJlbnZpcm9ubWVudC1zY2VuZS1sb2FkZWRcIiwgdGhpcy5uZXdTY2VuZSlcbiAgICAgICAgLy8gY29uc3QgZW52aXJvbm1lbnRTY2VuZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjZW52aXJvbm1lbnQtc2NlbmVcIik7XG4gICAgICAgIC8vIHRoaXMuYWRkU2NlbmVFbGVtZW50ID0gdGhpcy5hZGRTY2VuZUVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLnJlbW92ZVNjZW5lRWxlbWVudCA9IHRoaXMucmVtb3ZlU2NlbmVFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gZW52aXJvbm1lbnRTY2VuZS5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtYXR0YWNoZWRcIiwgdGhpcy5hZGRTY2VuZUVsZW1lbnQpXG4gICAgICAgIC8vIGVudmlyb25tZW50U2NlbmUuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWRldGFjaGVkXCIsIHRoaXMucmVtb3ZlU2NlbmVFbGVtZW50KVxuXG4gICAgICAgIC8vIHdlIHdhbnQgdG8gbm90aWNlIHdoZW4gbmV3IHRoaW5ncyBnZXQgYWRkZWQgdG8gdGhlIHJvb20uICBUaGlzIHdpbGwgaGFwcGVuIGZvclxuICAgICAgICAvLyBvYmplY3RzIGRyb3BwZWQgaW4gdGhlIHJvb20sIG9yIGZvciBuZXcgcmVtb3RlIGF2YXRhcnMsIGF0IGxlYXN0XG4gICAgICAgIC8vIHRoaXMuYWRkUm9vdEVsZW1lbnQgPSB0aGlzLmFkZFJvb3RFbGVtZW50LmJpbmQodGhpcylcbiAgICAgICAgLy8gdGhpcy5yZW1vdmVSb290RWxlbWVudCA9IHRoaXMucmVtb3ZlUm9vdEVsZW1lbnQuYmluZCh0aGlzKVxuICAgICAgICAvLyB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImNoaWxkLWF0dGFjaGVkXCIsIHRoaXMuYWRkUm9vdEVsZW1lbnQpXG4gICAgICAgIC8vIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKFwiY2hpbGQtZGV0YWNoZWRcIiwgdGhpcy5yZW1vdmVSb290RWxlbWVudClcblxuICAgICAgICAvLyB3YW50IHRvIHNlZSBpZiB0aGVyZSBhcmUgcGlubmVkIG9iamVjdHMgdGhhdCB3ZXJlIGxvYWRlZCBmcm9tIGh1YnNcbiAgICAgICAgbGV0IHJvb21PYmplY3RzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShcIlJvb21PYmplY3RzXCIpXG4gICAgICAgIHRoaXMucm9vbU9iamVjdHMgPSByb29tT2JqZWN0cy5sZW5ndGggPiAwID8gcm9vbU9iamVjdHNbMF0gOiBudWxsXG5cbiAgICAgICAgLy8gZ2V0IGF2YXRhcnNcbiAgICAgICAgY29uc3QgYXZhdGFycyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiW3BsYXllci1pbmZvXVwiKTtcbiAgICAgICAgYXZhdGFycy5mb3JFYWNoKChhdmF0YXIpID0+IHtcbiAgICAgICAgICAgIGF2YXRhci5zZXRBdHRyaWJ1dGUoXCJhdmF0YXItcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHdhbGsgb2JqZWN0cyBpbiB0aGUgcm9vdCAodGhpbmdzIHRoYXQgaGF2ZSBiZWVuIGRyb3BwZWQgb24gdGhlIHNjZW5lKVxuICAgICAgICAvLyAtIGRyYXdpbmdzIGhhdmUgY2xhc3M9XCJkcmF3aW5nXCIsIG5ldHdvcmtlZC1kcmF3aW5nXG4gICAgICAgIC8vIE5vdCBnb2luZyB0byBkbyBkcmF3aW5ncyByaWdodCBub3cuXG5cbiAgICAgICAgLy8gcGlubmVkIG1lZGlhIGxpdmUgdW5kZXIgYSBub2RlIHdpdGggY2xhc3M9XCJSb29tT2JqZWN0c1wiXG4gICAgICAgIHZhciBub2RlcyA9IHRoaXMuZWwuc2NlbmVFbC5xdWVyeVNlbGVjdG9yQWxsKFwiLlJvb21PYmplY3RzID4gW21lZGlhLWxvYWRlcl1cIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyAtIGNhbWVyYSBoYXMgY2FtZXJhLXRvb2wgICAgICAgIFxuICAgICAgICAvLyAtIGltYWdlIGZyb20gY2FtZXJhLCBvciBkcm9wcGVkLCBoYXMgbWVkaWEtbG9hZGVyLCBtZWRpYS1pbWFnZSwgbGlzdGVkLW1lZGlhXG4gICAgICAgIC8vIC0gZ2xiIGhhcyBtZWRpYS1sb2FkZXIsIGdsdGYtbW9kZWwtcGx1cywgbGlzdGVkLW1lZGlhXG4gICAgICAgIC8vIC0gdmlkZW8gaGFzIG1lZGlhLWxvYWRlciwgbWVkaWEtdmlkZW8sIGxpc3RlZC1tZWRpYVxuICAgICAgICAvL1xuICAgICAgICAvLyAgc28sIGdldCBhbGwgY2FtZXJhLXRvb2xzLCBhbmQgbWVkaWEtbG9hZGVyIG9iamVjdHMgYXQgdGhlIHRvcCBsZXZlbCBvZiB0aGUgc2NlbmVcbiAgICAgICAgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltjYW1lcmEtdG9vbF0sIGEtc2NlbmUgPiBbbWVkaWEtbG9hZGVyXVwiKTtcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJvYmplY3QtcmVnaW9uLWZvbGxvd2VyXCIsIHsgc2l6ZTogdGhpcy5zaXplIH0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbY2FtZXJhLXRvb2xdXCIpO1xuICAgICAgICBub2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gd2FsayB0aGUgb2JqZWN0cyBpbiB0aGUgZW52aXJvbm1lbnQgc2NlbmUuICBNdXN0IHdhaXQgZm9yIHNjZW5lIHRvIGZpbmlzaCBsb2FkaW5nXG4gICAgICAgIHRoaXMuc2NlbmVMb2FkZWQgPSB0aGlzLnNjZW5lTG9hZGVkLmJpbmQodGhpcylcbiAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoXCJlbnZpcm9ubWVudC1zY2VuZS1sb2FkZWRcIiwgdGhpcy5zY2VuZUxvYWRlZCk7XG5cbiAgICB9LFxuXG4gICAgaXNBbmNlc3RvcjogZnVuY3Rpb24gKHJvb3QsIGVudGl0eSkge1xuICAgICAgICB3aGlsZSAoZW50aXR5ICYmICEoZW50aXR5ID09IHJvb3QpKSB7XG4gICAgICAgICAgZW50aXR5ID0gZW50aXR5LnBhcmVudE5vZGU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIChlbnRpdHkgPT0gcm9vdCk7XG4gICAgfSxcbiAgICBcbiAgICAvLyBUaGluZ3Mgd2UgZG9uJ3Qgd2FudCB0byBoaWRlOlxuICAgIC8vIC0gW3dheXBvaW50XVxuICAgIC8vIC0gcGFyZW50IG9mIHNvbWV0aGluZyB3aXRoIFtuYXZtZXNoXSBhcyBhIGNoaWxkICh0aGlzIGlzIHRoZSBuYXZpZ2F0aW9uIHN0dWZmXG4gICAgLy8gLSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsXG4gICAgLy8gLSBbc2t5Ym94XVxuICAgIC8vIC0gW2RpcmVjdGlvbmFsLWxpZ2h0XVxuICAgIC8vIC0gW2FtYmllbnQtbGlnaHRdXG4gICAgLy8gLSBbaGVtaXNwaGVyZS1saWdodF1cbiAgICAvLyAtICNDb21iaW5lZE1lc2hcbiAgICAvLyAtICNzY2VuZS1wcmV2aWV3LWNhbWVyYSBvciBbc2NlbmUtcHJldmlldy1jYW1lcmFdXG4gICAgLy9cbiAgICAvLyB3ZSB3aWxsIGRvXG4gICAgLy8gLSBbbWVkaWEtbG9hZGVyXVxuICAgIC8vIC0gW3Nwb3QtbGlnaHRdXG4gICAgLy8gLSBbcG9pbnQtbGlnaHRdXG4gICAgc2NlbmVMb2FkZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgbGV0IG5vZGVzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJlbnZpcm9ubWVudC1zY2VuZVwiKS5jaGlsZHJlblswXS5jaGlsZHJlblswXVxuICAgICAgICAvL3ZhciBub2RlcyA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwucGFyZW50RWwuY2hpbGROb2RlcztcbiAgICAgICAgZm9yIChsZXQgaT0wOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBub2RlID0gbm9kZXNbaV1cbiAgICAgICAgICAgIC8vaWYgKG5vZGUgPT0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbCkge2NvbnRpbnVlfVxuICAgICAgICAgICAgaWYgKHRoaXMuaXNBbmNlc3Rvcihub2RlLCB0aGlzLmVsKSkge2NvbnRpbnVlfVxuXG4gICAgICAgICAgICBsZXQgY2wgPSBub2RlLmNsYXNzTmFtZVxuICAgICAgICAgICAgaWYgKGNsID09PSBcIkNvbWJpbmVkTWVzaFwiIHx8IGNsID09PSBcInNjZW5lLXByZXZpZXctY2FtZXJhXCIpIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGMgPSBub2RlLmNvbXBvbmVudHNcbiAgICAgICAgICAgIGlmIChjW1wid2F5cG9pbnRcIl0gfHwgY1tcInNreWJveFwiXSB8fCBjW1wiZGlyZWN0aW9uYWwtbGlnaHRcIl0gfHwgY1tcImFtYmllbnQtbGlnaHRcIl0gfHwgY1tcImhlbWlzcGhlcmUtbGlnaHRcIl0pIHtjb250aW51ZX1cblxuICAgICAgICAgICAgbGV0IGNoID0gbm9kZS5jaGlsZHJlblxuICAgICAgICAgICAgdmFyIG5hdm1lc2ggPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAobGV0IGo9MDsgaiA8IGNoLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNoW2pdLmNvbXBvbmVudHNbXCJuYXZtZXNoXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgIG5hdm1lc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobmF2bWVzaCkge2NvbnRpbnVlfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShcIm9iamVjdC1yZWdpb24tZm9sbG93ZXJcIiwgeyBzaXplOiB0aGlzLnNpemUsIGR5bmFtaWM6IGZhbHNlIH0pXG4gICAgICAgIH1cblxuICAgICAgICAvLyBhbGwgb2JqZWN0cyBhbmQgYXZhdGFyIHNob3VsZCBiZSBzZXQgdXAsIHNvIGxldHMgbWFrZSBzdXJlIGFsbCBvYmplY3RzIGFyZSBjb3JyZWN0bHkgc2hvd25cbiAgICAgICAgc2hvd0hpZGVPYmplY3RzKClcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEuc2l6ZSA9PT0gdGhpcy5zaXplKSByZXR1cm5cblxuICAgICAgICBpZiAodGhpcy5kYXRhLnNpemUgPT0gMCkge1xuICAgICAgICAgICAgdGhpcy5kYXRhLnNpemUgPSAxMFxuICAgICAgICAgICAgdGhpcy5zaXplID0gdGhpcy5wYXJzZU5vZGVOYW1lKHRoaXMuZGF0YS5zaXplKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICByZW1vdmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5lbC5zY2VuZUVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJlbnZpcm9ubWVudC1zY2VuZS1sb2FkZWRcIiwgdGhpcy5zY2VuZUxvYWRlZCk7XG4gICAgfSxcblxuICAgIC8vIHBlciBmcmFtZSBzdHVmZlxuICAgIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgICAgIC8vIHNpemUgPT0gMCBpcyB1c2VkIHRvIHNpZ25hbCBcImRvIG5vdGhpbmdcIlxuICAgICAgICBpZiAodGhpcy5zaXplID09IDApIHtyZXR1cm59XG5cbiAgICAgICAgLy8gc2VlIGlmIHRoZXJlIGFyZSBuZXcgYXZhdGFyc1xuICAgICAgICB2YXIgbm9kZXMgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvckFsbChcIltwbGF5ZXItaW5mb106bm90KFthdmF0YXItcmVnaW9uLWZvbGxvd2VyXSlcIilcbiAgICAgICAgbm9kZXMuZm9yRWFjaCgoYXZhdGFyKSA9PiB7XG4gICAgICAgICAgICBhdmF0YXIuc2V0QXR0cmlidXRlKFwiYXZhdGFyLXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyAgc2VlIGlmIHRoZXJlIGFyZSBuZXcgY2FtZXJhLXRvb2xzIG9yIG1lZGlhLWxvYWRlciBvYmplY3RzIGF0IHRoZSB0b3AgbGV2ZWwgb2YgdGhlIHNjZW5lXG4gICAgICAgIG5vZGVzID0gdGhpcy5lbC5zY2VuZUVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbY2FtZXJhLXRvb2xdOm5vdChbb2JqZWN0LXJlZ2lvbi1mb2xsb3dlcl0pLCBhLXNjZW5lID4gW21lZGlhLWxvYWRlcl06bm90KFtvYmplY3QtcmVnaW9uLWZvbGxvd2VyXSlcIik7XG4gICAgICAgIG5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwib2JqZWN0LXJlZ2lvbi1mb2xsb3dlclwiLCB7IHNpemU6IHRoaXMuc2l6ZSB9KVxuICAgICAgICB9KTtcbiAgICB9LFxuICBcbiAgICAvLyBuZXdTY2VuZTogZnVuY3Rpb24obW9kZWwpIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnZpcm9ubWVudCBzY2VuZSBsb2FkZWQ6IFwiLCBtb2RlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gYWRkUm9vdEVsZW1lbnQ6IGZ1bmN0aW9uKHsgZGV0YWlsOiB7IGVsIH0gfSkge1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhcImVudGl0eSBhZGRlZCB0byByb290OiBcIiwgZWwpXG4gICAgLy8gfSxcblxuICAgIC8vIHJlbW92ZVJvb3RFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgcmVtb3ZlZCBmcm9tIHJvb3Q6IFwiLCBlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gYWRkU2NlbmVFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgYWRkZWQgdG8gZW52aXJvbm1lbnQgc2NlbmU6IFwiLCBlbClcbiAgICAvLyB9LFxuXG4gICAgLy8gcmVtb3ZlU2NlbmVFbGVtZW50OiBmdW5jdGlvbih7IGRldGFpbDogeyBlbCB9IH0pIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJlbnRpdHkgcmVtb3ZlZCBmcm9tIGVudmlyb25tZW50IHNjZW5lOiBcIiwgZWwpXG4gICAgLy8gfSwgIFxuICAgIFxuICAgIHBhcnNlTm9kZU5hbWU6IGZ1bmN0aW9uIChzaXplKSB7XG4gICAgICAgIC8vIG5vZGVzIHNob3VsZCBiZSBuYW1lZCBhbnl0aGluZyBhdCB0aGUgYmVnaW5uaW5nIHdpdGggXG4gICAgICAgIC8vICBcInNpemVcIiAoYW4gaW50ZWdlciBudW1iZXIpXG4gICAgICAgIC8vIGF0IHRoZSB2ZXJ5IGVuZC4gIFRoaXMgd2lsbCBzZXQgdGhlIGhpZGRlciBjb21wb25lbnQgdG8gXG4gICAgICAgIC8vIHVzZSB0aGF0IHNpemUgaW4gbWV0ZXJzIGZvciB0aGUgcXVhZHJhbnRzXG4gICAgICAgIHRoaXMubm9kZU5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHRoaXMubm9kZU5hbWUubWF0Y2goL18oWzAtOV0qKSQvKVxuXG4gICAgICAgIC8vIGlmIHBhdHRlcm4gbWF0Y2hlcywgd2Ugd2lsbCBoYXZlIGxlbmd0aCBvZiAyLCBmaXJzdCBtYXRjaCBpcyB0aGUgZGlyLFxuICAgICAgICAvLyBzZWNvbmQgaXMgdGhlIGNvbXBvbmVudE5hbWUgbmFtZSBvciBudW1iZXJcbiAgICAgICAgaWYgKCFwYXJhbXMgfHwgcGFyYW1zLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInJlZ2lvbi1oaWRlciBjb21wb25lbnROYW1lIG5vdCBmb3JtYXR0ZWQgY29ycmVjdGx5OiBcIiwgdGhpcy5ub2RlTmFtZSlcbiAgICAgICAgICAgIHJldHVybiBzaXplXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgbm9kZVNpemUgPSBwYXJzZUludChwYXJhbXNbMV0pXG4gICAgICAgICAgICBpZiAoIW5vZGVTaXplKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNpemVcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5vZGVTaXplXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59KSIsImxldCBEZWZhdWx0SG9va3MgPSB7XG4gICAgdmVydGV4SG9va3M6IHtcbiAgICAgICAgdW5pZm9ybXM6ICdpbnNlcnRiZWZvcmU6I2luY2x1ZGUgPGNvbW1vbj5cXG4nLFxuICAgICAgICBmdW5jdGlvbnM6ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8Y2xpcHBpbmdfcGxhbmVzX3BhcnNfdmVydGV4PlxcbicsXG4gICAgICAgIHByZVRyYW5zZm9ybTogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxiZWdpbl92ZXJ0ZXg+XFxuJyxcbiAgICAgICAgcG9zdFRyYW5zZm9ybTogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxwcm9qZWN0X3ZlcnRleD5cXG4nLFxuICAgICAgICBwcmVOb3JtYWw6ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8YmVnaW5ub3JtYWxfdmVydGV4PlxcbidcbiAgICB9LFxuICAgIGZyYWdtZW50SG9va3M6IHtcbiAgICAgICAgdW5pZm9ybXM6ICdpbnNlcnRiZWZvcmU6I2luY2x1ZGUgPGNvbW1vbj5cXG4nLFxuICAgICAgICBmdW5jdGlvbnM6ICdpbnNlcnRhZnRlcjojaW5jbHVkZSA8Y2xpcHBpbmdfcGxhbmVzX3BhcnNfZnJhZ21lbnQ+XFxuJyxcbiAgICAgICAgcHJlRnJhZ0NvbG9yOiAnaW5zZXJ0YmVmb3JlOmdsX0ZyYWdDb2xvciA9IHZlYzQoIG91dGdvaW5nTGlnaHQsIGRpZmZ1c2VDb2xvci5hICk7XFxuJyxcbiAgICAgICAgcG9zdEZyYWdDb2xvcjogJ2luc2VydGFmdGVyOmdsX0ZyYWdDb2xvciA9IHZlYzQoIG91dGdvaW5nTGlnaHQsIGRpZmZ1c2VDb2xvci5hICk7XFxuJyxcbiAgICAgICAgcG9zdE1hcDogJ2luc2VydGFmdGVyOiNpbmNsdWRlIDxtYXBfZnJhZ21lbnQ+XFxuJyxcbiAgICAgICAgcmVwbGFjZU1hcDogJ3JlcGxhY2U6I2luY2x1ZGUgPG1hcF9mcmFnbWVudD5cXG4nXG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBEZWZhdWx0SG9va3MiLCIvLyBiYXNlZCBvbiBodHRwczovL2dpdGh1Yi5jb20vamFtaWVvd2VuL3RocmVlLW1hdGVyaWFsLW1vZGlmaWVyXG5cbmltcG9ydCBkZWZhdWx0SG9va3MgZnJvbSAnLi9kZWZhdWx0SG9va3MnO1xuXG5pbnRlcmZhY2UgRXh0ZW5kZWRNYXRlcmlhbCB7XG4gICAgdW5pZm9ybXM6IFVuaWZvcm1zO1xuICAgIHZlcnRleFNoYWRlcjogc3RyaW5nO1xuICAgIGZyYWdtZW50U2hhZGVyOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBTaGFkZXJFeHRlbnNpb25PcHRzIHtcbiAgICB1bmlmb3JtczogeyBbdW5pZm9ybTogc3RyaW5nXTogYW55IH07XG4gICAgdmVydGV4U2hhZGVyOiB7IFtwYXR0ZXJuOiBzdHJpbmddOiBzdHJpbmcgfTtcbiAgICBmcmFnbWVudFNoYWRlcjogeyBbcGF0dGVybjogc3RyaW5nXTogc3RyaW5nIH07XG4gICAgY2xhc3NOYW1lPzogc3RyaW5nO1xuICAgIHBvc3RNb2RpZnlWZXJ0ZXhTaGFkZXI/OiAoc2hhZGVyOiBzdHJpbmcpID0+IHN0cmluZztcbiAgICBwb3N0TW9kaWZ5RnJhZ21lbnRTaGFkZXI/OiAoc2hhZGVyOiBzdHJpbmcpID0+IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFNoYWRlckV4dGVuc2lvbiBleHRlbmRzIFNoYWRlckV4dGVuc2lvbk9wdHMge1xuICAgIGluaXQobWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCk6IHZvaWQ7XG4gICAgdXBkYXRlVW5pZm9ybXModGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKTogdm9pZFxufVxuXG5jb25zdCBtb2RpZnlTb3VyY2UgPSAoIHNvdXJjZTogc3RyaW5nLCBob29rRGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9LCBob29rczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9ICk9PntcbiAgICBsZXQgbWF0Y2g7XG4gICAgZm9yKCBsZXQga2V5IGluIGhvb2tEZWZzICl7XG4gICAgICAgIGlmKCBob29rc1trZXldICl7XG4gICAgICAgICAgICBtYXRjaCA9IC9pbnNlcnQoYmVmb3JlKTooLiopfGluc2VydChhZnRlcik6KC4qKXwocmVwbGFjZSk6KC4qKS8uZXhlYyggaG9va0RlZnNba2V5XSApO1xuXG4gICAgICAgICAgICBpZiggbWF0Y2ggKXtcbiAgICAgICAgICAgICAgICBpZiggbWF0Y2hbMV0gKXsgLy8gYmVmb3JlXG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlKCBtYXRjaFsyXSwgaG9va3Nba2V5XSArICdcXG4nICsgbWF0Y2hbMl0gKTtcbiAgICAgICAgICAgICAgICB9ZWxzZVxuICAgICAgICAgICAgICAgIGlmKCBtYXRjaFszXSApeyAvLyBhZnRlclxuICAgICAgICAgICAgICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZSggbWF0Y2hbNF0sIG1hdGNoWzRdICsgJ1xcbicgKyBob29rc1trZXldICk7XG4gICAgICAgICAgICAgICAgfWVsc2VcbiAgICAgICAgICAgICAgICBpZiggbWF0Y2hbNV0gKXsgLy8gcmVwbGFjZVxuICAgICAgICAgICAgICAgICAgICBzb3VyY2UgPSBzb3VyY2UucmVwbGFjZSggbWF0Y2hbNl0sIGhvb2tzW2tleV0gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gc291cmNlO1xufVxuXG50eXBlIFVuaWZvcm1zID0ge1xuICAgIFtrZXk6IHN0cmluZ106IGFueTtcbn1cblxuLy8gY29waWVkIGZyb20gdGhyZWUucmVuZGVyZXJzLnNoYWRlcnMuVW5pZm9ybVV0aWxzLmpzXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVVbmlmb3Jtcyggc3JjOiBVbmlmb3JtcyApOiBVbmlmb3JtcyB7XG5cdHZhciBkc3Q6IFVuaWZvcm1zID0ge307XG5cblx0Zm9yICggdmFyIHUgaW4gc3JjICkge1xuXHRcdGRzdFsgdSBdID0ge30gO1xuXHRcdGZvciAoIHZhciBwIGluIHNyY1sgdSBdICkge1xuXHRcdFx0dmFyIHByb3BlcnR5ID0gc3JjWyB1IF1bIHAgXTtcblx0XHRcdGlmICggcHJvcGVydHkgJiYgKCBwcm9wZXJ0eS5pc0NvbG9yIHx8XG5cdFx0XHRcdHByb3BlcnR5LmlzTWF0cml4MyB8fCBwcm9wZXJ0eS5pc01hdHJpeDQgfHxcblx0XHRcdFx0cHJvcGVydHkuaXNWZWN0b3IyIHx8IHByb3BlcnR5LmlzVmVjdG9yMyB8fCBwcm9wZXJ0eS5pc1ZlY3RvcjQgfHxcblx0XHRcdFx0cHJvcGVydHkuaXNUZXh0dXJlICkgKSB7XG5cdFx0XHRcdCAgICBkc3RbIHUgXVsgcCBdID0gcHJvcGVydHkuY2xvbmUoKTtcblx0XHRcdH0gZWxzZSBpZiAoIEFycmF5LmlzQXJyYXkoIHByb3BlcnR5ICkgKSB7XG5cdFx0XHRcdGRzdFsgdSBdWyBwIF0gPSBwcm9wZXJ0eS5zbGljZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZHN0WyB1IF1bIHAgXSA9IHByb3BlcnR5O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gZHN0O1xufVxuXG50eXBlIFN1cGVyQ2xhc3NUeXBlcyA9IHR5cGVvZiBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCB8IHR5cGVvZiBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCB8IHR5cGVvZiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsIHwgdHlwZW9mIFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsIHwgdHlwZW9mIFRIUkVFLk1lc2hEZXB0aE1hdGVyaWFsXG5cbnR5cGUgU3VwZXJDbGFzc2VzID0gVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwgfCBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCB8IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwgfCBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCB8IFRIUkVFLk1lc2hEZXB0aE1hdGVyaWFsXG5cbmludGVyZmFjZSBFeHRlbnNpb25EYXRhIHtcbiAgICBTaGFkZXJDbGFzczogU3VwZXJDbGFzc1R5cGVzO1xuICAgIFNoYWRlckxpYjogVEhSRUUuU2hhZGVyO1xuICAgIEtleTogc3RyaW5nLFxuICAgIENvdW50OiBudW1iZXIsXG4gICAgTW9kaWZpZWROYW1lKCk6IHN0cmluZyxcbiAgICBUeXBlQ2hlY2s6IHN0cmluZ1xufVxuXG5sZXQgY2xhc3NNYXA6IHtbbmFtZTogc3RyaW5nXTogc3RyaW5nO30gPSB7XG4gICAgTWVzaFN0YW5kYXJkTWF0ZXJpYWw6IFwic3RhbmRhcmRcIixcbiAgICBNZXNoQmFzaWNNYXRlcmlhbDogXCJiYXNpY1wiLFxuICAgIE1lc2hMYW1iZXJ0TWF0ZXJpYWw6IFwibGFtYmVydFwiLFxuICAgIE1lc2hQaG9uZ01hdGVyaWFsOiBcInBob25nXCIsXG4gICAgTWVzaERlcHRoTWF0ZXJpYWw6IFwiZGVwdGhcIixcbiAgICBzdGFuZGFyZDogXCJzdGFuZGFyZFwiLFxuICAgIGJhc2ljOiBcImJhc2ljXCIsXG4gICAgbGFtYmVydDogXCJsYW1iZXJ0XCIsXG4gICAgcGhvbmc6IFwicGhvbmdcIixcbiAgICBkZXB0aDogXCJkZXB0aFwiXG59XG5cbmxldCBzaGFkZXJNYXA6IHtbbmFtZTogc3RyaW5nXTogRXh0ZW5zaW9uRGF0YTt9XG5cbmNvbnN0IGdldFNoYWRlckRlZiA9ICggY2xhc3NPclN0cmluZzogU3VwZXJDbGFzc2VzIHwgc3RyaW5nICk9PntcblxuICAgIGlmKCAhc2hhZGVyTWFwICl7XG5cbiAgICAgICAgbGV0IGNsYXNzZXM6IHtbbmFtZTogc3RyaW5nXTogU3VwZXJDbGFzc1R5cGVzO30gPSB7XG4gICAgICAgICAgICBzdGFuZGFyZDogVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwsXG4gICAgICAgICAgICBiYXNpYzogVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwsXG4gICAgICAgICAgICBsYW1iZXJ0OiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsLFxuICAgICAgICAgICAgcGhvbmc6IFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsLFxuICAgICAgICAgICAgZGVwdGg6IFRIUkVFLk1lc2hEZXB0aE1hdGVyaWFsXG4gICAgICAgIH1cblxuICAgICAgICBzaGFkZXJNYXAgPSB7fTtcblxuICAgICAgICBmb3IoIGxldCBrZXkgaW4gY2xhc3NlcyApe1xuICAgICAgICAgICAgc2hhZGVyTWFwWyBrZXkgXSA9IHtcbiAgICAgICAgICAgICAgICBTaGFkZXJDbGFzczogY2xhc3Nlc1sga2V5IF0sXG4gICAgICAgICAgICAgICAgU2hhZGVyTGliOiBUSFJFRS5TaGFkZXJMaWJbIGtleSBdLFxuICAgICAgICAgICAgICAgIEtleToga2V5LFxuICAgICAgICAgICAgICAgIENvdW50OiAwLFxuICAgICAgICAgICAgICAgIE1vZGlmaWVkTmFtZTogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBNb2RpZmllZE1lc2gkeyB0aGlzLktleVswXS50b1VwcGVyQ2FzZSgpICsgdGhpcy5LZXkuc2xpY2UoMSkgfU1hdGVyaWFsXyR7ICsrdGhpcy5Db3VudCB9YDtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFR5cGVDaGVjazogYGlzTWVzaCR7IGtleVswXS50b1VwcGVyQ2FzZSgpICsga2V5LnNsaWNlKDEpIH1NYXRlcmlhbGBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxldCBzaGFkZXJEZWY6IEV4dGVuc2lvbkRhdGEgfCB1bmRlZmluZWQ7XG5cbiAgICBpZiAoIHR5cGVvZiBjbGFzc09yU3RyaW5nID09PSAnZnVuY3Rpb24nICl7XG4gICAgICAgIGZvciggbGV0IGtleSBpbiBzaGFkZXJNYXAgKXtcbiAgICAgICAgICAgIGlmKCBzaGFkZXJNYXBbIGtleSBdLlNoYWRlckNsYXNzID09PSBjbGFzc09yU3RyaW5nICl7XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gc2hhZGVyTWFwWyBrZXkgXTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGNsYXNzT3JTdHJpbmcgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGxldCBtYXBwZWRDbGFzc09yU3RyaW5nID0gY2xhc3NNYXBbIGNsYXNzT3JTdHJpbmcgXVxuICAgICAgICBzaGFkZXJEZWYgPSBzaGFkZXJNYXBbIG1hcHBlZENsYXNzT3JTdHJpbmcgfHwgY2xhc3NPclN0cmluZyBdO1xuICAgIH1cblxuICAgIGlmKCAhc2hhZGVyRGVmICl7XG4gICAgICAgIHRocm93IG5ldyBFcnJvciggJ05vIFNoYWRlciBmb3VuZCB0byBtb2RpZnkuLi4nICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNoYWRlckRlZjtcbn1cblxuLyoqXG4gKiBUaGUgbWFpbiBNYXRlcmlhbCBNb2RvZmllclxuICovXG5jbGFzcyBNYXRlcmlhbE1vZGlmaWVyIHtcbiAgICBfdmVydGV4SG9va3M6IHtbdmVydGV4aG9vazogc3RyaW5nXTogc3RyaW5nfVxuICAgIF9mcmFnbWVudEhvb2tzOiB7W2ZyYWdlbWVudGhvb2s6IHN0cmluZ106IHN0cmluZ31cblxuICAgIGNvbnN0cnVjdG9yKCB2ZXJ0ZXhIb29rRGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9LCBmcmFnbWVudEhvb2tEZWZzOiB7W25hbWU6IHN0cmluZ106IHN0cmluZ30gKXtcblxuICAgICAgICB0aGlzLl92ZXJ0ZXhIb29rcyA9IHt9O1xuICAgICAgICB0aGlzLl9mcmFnbWVudEhvb2tzID0ge307XG5cbiAgICAgICAgaWYoIHZlcnRleEhvb2tEZWZzICl7XG4gICAgICAgICAgICB0aGlzLmRlZmluZVZlcnRleEhvb2tzKCB2ZXJ0ZXhIb29rRGVmcyApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIGZyYWdtZW50SG9va0RlZnMgKXtcbiAgICAgICAgICAgIHRoaXMuZGVmaW5lRnJhZ21lbnRIb29rcyggZnJhZ21lbnRIb29rRGVmcyApO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBtb2RpZnkoIHNoYWRlcjogU3VwZXJDbGFzc2VzIHwgc3RyaW5nLCBvcHRzOiBTaGFkZXJFeHRlbnNpb25PcHRzICk6IEV4dGVuZGVkTWF0ZXJpYWwge1xuXG4gICAgICAgIGxldCBkZWYgPSBnZXRTaGFkZXJEZWYoIHNoYWRlciApO1xuXG4gICAgICAgIGxldCB2ZXJ0ZXhTaGFkZXIgPSBtb2RpZnlTb3VyY2UoIGRlZi5TaGFkZXJMaWIudmVydGV4U2hhZGVyLCB0aGlzLl92ZXJ0ZXhIb29rcywgb3B0cy52ZXJ0ZXhTaGFkZXIgfHwge30gKTtcbiAgICAgICAgbGV0IGZyYWdtZW50U2hhZGVyID0gbW9kaWZ5U291cmNlKCBkZWYuU2hhZGVyTGliLmZyYWdtZW50U2hhZGVyLCB0aGlzLl9mcmFnbWVudEhvb2tzLCBvcHRzLmZyYWdtZW50U2hhZGVyIHx8IHt9ICk7XG4gICAgICAgIGxldCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oIHt9LCBkZWYuU2hhZGVyTGliLnVuaWZvcm1zLCBvcHRzLnVuaWZvcm1zIHx8IHt9ICk7XG5cbiAgICAgICAgcmV0dXJuIHsgdmVydGV4U2hhZGVyLGZyYWdtZW50U2hhZGVyLHVuaWZvcm1zIH07XG5cbiAgICB9XG5cbiAgICBleHRlbmQoIHNoYWRlcjogU3VwZXJDbGFzc2VzIHwgc3RyaW5nLCBvcHRzOiBTaGFkZXJFeHRlbnNpb25PcHRzICk6IHsgbmV3KCk6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCB9IHtcblxuICAgICAgICBsZXQgZGVmID0gZ2V0U2hhZGVyRGVmKCBzaGFkZXIgKTsgLy8gQURKVVNUIFRISVMgU0hBREVSIERFRiAtIE9OTFkgREVGSU5FIE9OQ0UgLSBBTkQgU1RPUkUgQSBVU0UgQ09VTlQgT04gRVhURU5ERUQgVkVSU0lPTlMuXG5cbiAgICAgICAgbGV0IHZlcnRleFNoYWRlciA9IG1vZGlmeVNvdXJjZSggZGVmLlNoYWRlckxpYi52ZXJ0ZXhTaGFkZXIsIHRoaXMuX3ZlcnRleEhvb2tzLCBvcHRzLnZlcnRleFNoYWRlciB8fCB7fSApO1xuICAgICAgICBsZXQgZnJhZ21lbnRTaGFkZXIgPSBtb2RpZnlTb3VyY2UoIGRlZi5TaGFkZXJMaWIuZnJhZ21lbnRTaGFkZXIsIHRoaXMuX2ZyYWdtZW50SG9va3MsIG9wdHMuZnJhZ21lbnRTaGFkZXIgfHwge30gKTtcbiAgICAgICAgbGV0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbigge30sIGRlZi5TaGFkZXJMaWIudW5pZm9ybXMsIG9wdHMudW5pZm9ybXMgfHwge30gKTtcblxuICAgICAgICBsZXQgQ2xhc3NOYW1lID0gb3B0cy5jbGFzc05hbWUgfHwgZGVmLk1vZGlmaWVkTmFtZSgpO1xuXG4gICAgICAgIGxldCBleHRlbmRNYXRlcmlhbCA9IG5ldyBGdW5jdGlvbiggJ0Jhc2VDbGFzcycsICd1bmlmb3JtcycsICd2ZXJ0ZXhTaGFkZXInLCAnZnJhZ21lbnRTaGFkZXInLCAnY2xvbmVVbmlmb3JtcycsYFxuXG4gICAgICAgICAgICBsZXQgY2xzID0gY2xhc3MgJHtDbGFzc05hbWV9IGV4dGVuZHMgQmFzZUNsYXNzIHtcbiAgICAgICAgICAgICAgICBjb25zdHJ1Y3RvciggcGFyYW1zICl7XG4gICAgICAgICAgICAgICAgICAgIHN1cGVyKHBhcmFtcylcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51bmlmb3JtcyA9IGNsb25lVW5pZm9ybXMoIHVuaWZvcm1zICk7XG4gICAgXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudmVydGV4U2hhZGVyID0gdmVydGV4U2hhZGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZyYWdtZW50U2hhZGVyID0gZnJhZ21lbnRTaGFkZXI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudHlwZSA9ICcke0NsYXNzTmFtZX0nO1xuICAgIFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFZhbHVlcyggcGFyYW1zICk7XG4gICAgICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgICAgIGNvcHkoIHNvdXJjZSApe1xuICAgIFxuICAgICAgICAgICAgICAgICAgICBzdXBlci5jb3B5KHNvdXJjZSApO1xuICAgIFxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbigge30sIHNvdXJjZS51bmlmb3JtcyApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnZlcnRleFNoYWRlciA9IHZlcnRleFNoYWRlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mcmFnbWVudFNoYWRlciA9IGZyYWdtZW50U2hhZGVyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnR5cGUgPSAnJHtDbGFzc05hbWV9JztcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgXG4gICAgICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdmFyIGNscyA9IGZ1bmN0aW9uICR7Q2xhc3NOYW1lfSggcGFyYW1zICl7XG5cbiAgICAgICAgICAgIC8vICAgICAvL0Jhc2VDbGFzcy5wcm90b3R5cGUuY29uc3RydWN0b3IuY2FsbCggdGhpcywgcGFyYW1zICk7XG5cbiAgICAgICAgICAgIC8vICAgICB0aGlzLnVuaWZvcm1zID0gY2xvbmVVbmlmb3JtcyggdW5pZm9ybXMgKTtcblxuICAgICAgICAgICAgLy8gICAgIHRoaXMudmVydGV4U2hhZGVyID0gdmVydGV4U2hhZGVyO1xuICAgICAgICAgICAgLy8gICAgIHRoaXMuZnJhZ21lbnRTaGFkZXIgPSBmcmFnbWVudFNoYWRlcjtcbiAgICAgICAgICAgIC8vICAgICB0aGlzLnR5cGUgPSAnJHtDbGFzc05hbWV9JztcblxuICAgICAgICAgICAgLy8gICAgIHRoaXMuc2V0VmFsdWVzKCBwYXJhbXMgKTtcblxuICAgICAgICAgICAgLy8gfVxuXG4gICAgICAgICAgICAvLyBjbHMucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZSggQmFzZUNsYXNzLnByb3RvdHlwZSApO1xuICAgICAgICAgICAgLy8gY2xzLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGNscztcbiAgICAgICAgICAgIC8vIGNscy5wcm90b3R5cGUuJHsgZGVmLlR5cGVDaGVjayB9ID0gdHJ1ZTtcblxuICAgICAgICAgICAgLy8gY2xzLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24oIHNvdXJjZSApe1xuXG4gICAgICAgICAgICAvLyAgICAgQmFzZUNsYXNzLnByb3RvdHlwZS5jb3B5LmNhbGwoIHRoaXMsIHNvdXJjZSApO1xuXG4gICAgICAgICAgICAvLyAgICAgdGhpcy51bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oIHt9LCBzb3VyY2UudW5pZm9ybXMgKTtcbiAgICAgICAgICAgIC8vICAgICB0aGlzLnZlcnRleFNoYWRlciA9IHZlcnRleFNoYWRlcjtcbiAgICAgICAgICAgIC8vICAgICB0aGlzLmZyYWdtZW50U2hhZGVyID0gZnJhZ21lbnRTaGFkZXI7XG4gICAgICAgICAgICAvLyAgICAgdGhpcy50eXBlID0gJyR7Q2xhc3NOYW1lfSc7XG5cbiAgICAgICAgICAgIC8vICAgICByZXR1cm4gdGhpcztcblxuICAgICAgICAgICAgLy8gfVxuXG4gICAgICAgICAgICByZXR1cm4gY2xzO1xuXG4gICAgICAgIGApO1xuXG4gICAgICAgIGlmKCBvcHRzLnBvc3RNb2RpZnlWZXJ0ZXhTaGFkZXIgKXtcbiAgICAgICAgICAgIHZlcnRleFNoYWRlciA9IG9wdHMucG9zdE1vZGlmeVZlcnRleFNoYWRlciggdmVydGV4U2hhZGVyICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYoIG9wdHMucG9zdE1vZGlmeUZyYWdtZW50U2hhZGVyICl7XG4gICAgICAgICAgICBmcmFnbWVudFNoYWRlciA9IG9wdHMucG9zdE1vZGlmeUZyYWdtZW50U2hhZGVyKCBmcmFnbWVudFNoYWRlciApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGV4dGVuZE1hdGVyaWFsKCBkZWYuU2hhZGVyQ2xhc3MsIHVuaWZvcm1zLCB2ZXJ0ZXhTaGFkZXIsIGZyYWdtZW50U2hhZGVyLCBjbG9uZVVuaWZvcm1zICk7XG5cbiAgICB9XG5cbiAgICBkZWZpbmVWZXJ0ZXhIb29rcyggZGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmd9ICl7XG5cbiAgICAgICAgZm9yKCBsZXQga2V5IGluIGRlZnMgKXtcbiAgICAgICAgICAgIHRoaXMuX3ZlcnRleEhvb2tzWyBrZXkgXSA9IGRlZnNba2V5XTtcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgZGVmaW5lRnJhZ21lbnRIb29rcyggZGVmczoge1tuYW1lOiBzdHJpbmddOiBzdHJpbmcgfSApIHtcblxuICAgICAgICBmb3IoIGxldCBrZXkgaW4gZGVmcyApe1xuICAgICAgICAgICAgdGhpcy5fZnJhZ21lbnRIb29rc1sga2V5IF0gPSBkZWZzW2tleV07XG4gICAgICAgIH1cblxuICAgIH1cblxufVxuXG5sZXQgZGVmYXVsdE1hdGVyaWFsTW9kaWZpZXIgPSBuZXcgTWF0ZXJpYWxNb2RpZmllciggZGVmYXVsdEhvb2tzLnZlcnRleEhvb2tzLCBkZWZhdWx0SG9va3MuZnJhZ21lbnRIb29rcyApO1xuXG5leHBvcnQgeyBFeHRlbmRlZE1hdGVyaWFsLCBNYXRlcmlhbE1vZGlmaWVyLCBTaGFkZXJFeHRlbnNpb24sIFNoYWRlckV4dGVuc2lvbk9wdHMsIGRlZmF1bHRNYXRlcmlhbE1vZGlmaWVyICBhcyBEZWZhdWx0TWF0ZXJpYWxNb2RpZmllcn0iLCJleHBvcnQgZGVmYXVsdCAvKiBnbHNsICovYFxuICAgICAgICAvLyBhYm92ZSBoZXJlLCB0aGUgdGV4dHVyZSBsb29rdXAgd2lsbCBiZSBkb25lLCB3aGljaCB3ZVxuICAgICAgICAvLyBjYW4gZGlzYWJsZSBieSByZW1vdmluZyB0aGUgbWFwIGZyb20gdGhlIG1hdGVyaWFsXG4gICAgICAgIC8vIGJ1dCBpZiB3ZSBsZWF2ZSBpdCwgd2UgY2FuIGFsc28gY2hvb3NlIHRoZSBibGVuZCB0aGUgdGV4dHVyZVxuICAgICAgICAvLyB3aXRoIG91ciBzaGFkZXIgY3JlYXRlZCBjb2xvciwgb3IgdXNlIGl0IGluIHRoZSBzaGFkZXIgb3JcbiAgICAgICAgLy8gd2hhdGV2ZXJcbiAgICAgICAgLy9cbiAgICAgICAgLy8gdmVjNCB0ZXhlbENvbG9yID0gdGV4dHVyZTJEKCBtYXAsIHZVdiApO1xuICAgICAgICAvLyB0ZXhlbENvbG9yID0gbWFwVGV4ZWxUb0xpbmVhciggdGV4ZWxDb2xvciApO1xuICAgICAgICBcbiAgICAgICAgdmVjMiB1diA9IG1vZCh2VXYueHksIHZlYzIoMS4wLDEuMCkpOyAvL21vZCh2VXYueHkgKiB0ZXhSZXBlYXQueHkgKyB0ZXhPZmZzZXQueHksIHZlYzIoMS4wLDEuMCkpO1xuXG4gICAgICAgIGlmICh1di54IDwgMC4wKSB7IHV2LnggPSB1di54ICsgMS4wO31cbiAgICAgICAgaWYgKHV2LnkgPCAwLjApIHsgdXYueSA9IHV2LnkgKyAxLjA7fVxuICAgICAgICBpZiAodGV4RmxpcFkgPiAwKSB7IHV2LnkgPSAxLjAgLSB1di55O31cbiAgICAgICAgdXYueCA9IGNsYW1wKHV2LngsIDAuMCwgMS4wKTtcbiAgICAgICAgdXYueSA9IGNsYW1wKHV2LnksIDAuMCwgMS4wKTtcbiAgICAgICAgXG4gICAgICAgIHZlYzQgc2hhZGVyQ29sb3I7XG4gICAgICAgIG1haW5JbWFnZShzaGFkZXJDb2xvciwgdXYueHkgKiBpUmVzb2x1dGlvbi54eSk7XG4gICAgICAgIHNoYWRlckNvbG9yID0gbWFwVGV4ZWxUb0xpbmVhciggc2hhZGVyQ29sb3IgKTtcblxuICAgICAgICBkaWZmdXNlQ29sb3IgKj0gc2hhZGVyQ29sb3I7XG5gO1xuIiwiZXhwb3J0IGRlZmF1bHQge1xuICAgIGlUaW1lOiB7IHZhbHVlOiAwLjAgfSxcbiAgICBpUmVzb2x1dGlvbjogIHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IzKDUxMiwgNTEyLCAxKSB9LFxuICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9LFxuICAgIHRleEZsaXBZOiB7IHZhbHVlOiAwIH1cbn07IiwiZXhwb3J0IGRlZmF1bHQgLyogZ2xzbCAqL2BcbnVuaWZvcm0gdmVjMyBpUmVzb2x1dGlvbjtcbnVuaWZvcm0gZmxvYXQgaVRpbWU7XG51bmlmb3JtIHZlYzIgdGV4UmVwZWF0O1xudW5pZm9ybSB2ZWMyIHRleE9mZnNldDtcbnVuaWZvcm0gaW50IHRleEZsaXBZOyBcbiAgYDtcbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly93aWxsaWFtY2FzZXlsdWNhcy5naXRodWIuaW8vY29yZS1jb21wb25lbnRzL2E0NDhlMzRiODEzNmZhZTUucG5nXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly90aHJlZWpzZnVuZGFtZW50YWxzLm9yZy90aHJlZWpzL2xlc3NvbnMvdGhyZWVqcy1zaGFkZXJ0b3kuaHRtbFxuLy8gd2hpY2ggaW4gdHVybiBpcyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek1cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBiYXllckltYWdlIGZyb20gJy4uL2Fzc2V0cy9iYXllci5wbmcnXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgYmF5ZXJUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChiYXllckltYWdlLCAoYmF5ZXIpID0+IHtcbiAgICBiYXllci5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIGJheWVyLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgYmF5ZXIud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBiYXllci53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGJheWVyVGV4ID0gYmF5ZXJcbn0pXG5cbmxldCBCbGVlcHlCbG9ja3NTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuXG4gIHZlcnRleFNoYWRlcjoge30sXG5cbiAgZnJhZ21lbnRTaGFkZXI6IHsgXG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgLy8gQnkgRGFlZGVsdXM6IGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdXNlci9EYWVkZWx1c1xuICAgICAgLy8gbGljZW5zZTogQ3JlYXRpdmUgQ29tbW9ucyBBdHRyaWJ1dGlvbi1Ob25Db21tZXJjaWFsLVNoYXJlQWxpa2UgMy4wIFVucG9ydGVkIExpY2Vuc2UuXG4gICAgICAjZGVmaW5lIFRJTUVTQ0FMRSAwLjI1IFxuICAgICAgI2RlZmluZSBUSUxFUyA4XG4gICAgICAjZGVmaW5lIENPTE9SIDAuNywgMS42LCAyLjhcblxuICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxuICAgICAge1xuICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHk7XG4gICAgICAgIHV2LnggKj0gaVJlc29sdXRpb24ueCAvIGlSZXNvbHV0aW9uLnk7XG4gICAgICAgIFxuICAgICAgICB2ZWM0IG5vaXNlID0gdGV4dHVyZTJEKGlDaGFubmVsMCwgZmxvb3IodXYgKiBmbG9hdChUSUxFUykpIC8gZmxvYXQoVElMRVMpKTtcbiAgICAgICAgZmxvYXQgcCA9IDEuMCAtIG1vZChub2lzZS5yICsgbm9pc2UuZyArIG5vaXNlLmIgKyBpVGltZSAqIGZsb2F0KFRJTUVTQ0FMRSksIDEuMCk7XG4gICAgICAgIHAgPSBtaW4obWF4KHAgKiAzLjAgLSAxLjgsIDAuMSksIDIuMCk7XG4gICAgICAgIFxuICAgICAgICB2ZWMyIHIgPSBtb2QodXYgKiBmbG9hdChUSUxFUyksIDEuMCk7XG4gICAgICAgIHIgPSB2ZWMyKHBvdyhyLnggLSAwLjUsIDIuMCksIHBvdyhyLnkgLSAwLjUsIDIuMCkpO1xuICAgICAgICBwICo9IDEuMCAtIHBvdyhtaW4oMS4wLCAxMi4wICogZG90KHIsIHIpKSwgMi4wKTtcbiAgICAgICAgXG4gICAgICAgIGZyYWdDb2xvciA9IHZlYzQoQ09MT1IsIDEuMCkgKiBwO1xuICAgICAgfVxuICAgICAgYCxcbiAgICAgICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gYmF5ZXJUZXhcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSB0aW1lICogMC4wMDFcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gYmF5ZXJUZXhcbiAgICB9XG5cbn1cbmV4cG9ydCB7IEJsZWVweUJsb2Nrc1NoYWRlciB9XG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly90aHJlZWpzZnVuZGFtZW50YWxzLm9yZy90aHJlZWpzL2xlc3NvbnMvdGhyZWVqcy1zaGFkZXJ0b3kuaHRtbFxuLy8gd2hpY2ggaW4gdHVybiBpcyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek1cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxubGV0IE5vaXNlU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmopLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAjZGVmaW5lIG5QSSAzLjE0MTU5MjY1MzU4OTc5MzJcblxuICAgICAgICBtYXQyIG5fcm90YXRlMmQoZmxvYXQgYW5nbGUpe1xuICAgICAgICAgICAgICAgIHJldHVybiBtYXQyKGNvcyhhbmdsZSksLXNpbihhbmdsZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luKGFuZ2xlKSwgY29zKGFuZ2xlKSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZsb2F0IG5fc3RyaXBlKGZsb2F0IG51bWJlcikge1xuICAgICAgICAgICAgICAgIGZsb2F0IG1vZCA9IG1vZChudW1iZXIsIDIuMCk7XG4gICAgICAgICAgICAgICAgLy9yZXR1cm4gc3RlcCgwLjUsIG1vZCkqc3RlcCgxLjUsIG1vZCk7XG4gICAgICAgICAgICAgICAgLy9yZXR1cm4gbW9kLTEuMDtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWluKDEuMCwgKHNtb290aHN0ZXAoMC4wLCAwLjUsIG1vZCkgLSBzbW9vdGhzdGVwKDAuNSwgMS4wLCBtb2QpKSoxLjApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApIHtcbiAgICAgICAgICAgICAgICB2ZWMyIHVfcmVzb2x1dGlvbiA9IGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICAgICAgICAgIGZsb2F0IHVfdGltZSA9IGlUaW1lO1xuICAgICAgICAgICAgICAgIHZlYzMgY29sb3I7XG4gICAgICAgICAgICAgICAgdmVjMiBzdCA9IGZyYWdDb29yZC54eTtcbiAgICAgICAgICAgICAgICBzdCArPSAyMDAwLjAgKyA5OTgwMDAuMCpzdGVwKDEuNzUsIDEuMC1zaW4odV90aW1lLzguMCkpO1xuICAgICAgICAgICAgICAgIHN0ICs9IHVfdGltZS8yMDAwLjA7XG4gICAgICAgICAgICAgICAgZmxvYXQgbSA9ICgxLjArOS4wKnN0ZXAoMS4wLCAxLjAtc2luKHVfdGltZS84LjApKSkvKDEuMCs5LjAqc3RlcCgxLjAsIDEuMC1zaW4odV90aW1lLzE2LjApKSk7XG4gICAgICAgICAgICAgICAgdmVjMiBzdDEgPSBzdCAqICg0MDAuMCArIDEyMDAuMCpzdGVwKDEuNzUsIDEuMCtzaW4odV90aW1lKSkgLSAzMDAuMCpzdGVwKDEuNSwgMS4wK3Npbih1X3RpbWUvMy4wKSkpO1xuICAgICAgICAgICAgICAgIHN0ID0gbl9yb3RhdGUyZChzaW4oc3QxLngpKnNpbihzdDEueSkvKG0qMTAwLjArdV90aW1lLzEwMC4wKSkgKiBzdDtcbiAgICAgICAgICAgICAgICB2ZWMyIHN0MiA9IHN0ICogKDEwMC4wICsgMTkwMC4wKnN0ZXAoMS43NSwgMS4wLXNpbih1X3RpbWUvMi4wKSkpO1xuICAgICAgICAgICAgICAgIHN0ID0gbl9yb3RhdGUyZChjb3Moc3QyLngpKmNvcyhzdDIueSkvKG0qMTAwLjArdV90aW1lLzEwMC4wKSkgKiBzdDtcbiAgICAgICAgICAgICAgICBzdCA9IG5fcm90YXRlMmQoMC41Km5QSSsoblBJKjAuNSpzdGVwKCAxLjAsMS4wKyBzaW4odV90aW1lLzEuMCkpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKyhuUEkqMC4xKnN0ZXAoIDEuMCwxLjArIGNvcyh1X3RpbWUvMi4wKSkpK3VfdGltZSowLjAwMDEpICogc3Q7XG4gICAgICAgICAgICAgICAgc3QgKj0gMTAuMDtcbiAgICAgICAgICAgICAgICBzdCAvPSB1X3Jlc29sdXRpb247XG4gICAgICAgICAgICAgICAgY29sb3IgPSB2ZWMzKG5fc3RyaXBlKHN0LngqdV9yZXNvbHV0aW9uLngvMTAuMCt1X3RpbWUvMTAuMCkpO1xuICAgICAgICAgICAgICAgIGZyYWdDb2xvciA9IHZlYzQoY29sb3IsIDEuMCk7XG4gICAgICAgIH1cbiAgICAgICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMVxuICAgIH1cbn1cblxuXG5leHBvcnQgeyBOb2lzZVNoYWRlciB9XG4iLCIvLyBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9YZHNCREJcbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxubGV0IExpcXVpZE1hcmJsZVNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqKSxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcbiAgICAgIC8vLy8gQ09MT1JTIC8vLy9cblxuICAgICAgY29uc3QgdmVjMyBPUkFOR0UgPSB2ZWMzKDEuMCwgMC42LCAwLjIpO1xuICAgICAgY29uc3QgdmVjMyBQSU5LICAgPSB2ZWMzKDAuNywgMC4xLCAwLjQpOyBcbiAgICAgIGNvbnN0IHZlYzMgQkxVRSAgID0gdmVjMygwLjAsIDAuMiwgMC45KTsgXG4gICAgICBjb25zdCB2ZWMzIEJMQUNLICA9IHZlYzMoMC4wLCAwLjAsIDAuMik7XG4gICAgICBcbiAgICAgIC8vLy8vIE5PSVNFIC8vLy8vXG4gICAgICBcbiAgICAgIGZsb2F0IGhhc2goIGZsb2F0IG4gKSB7XG4gICAgICAgICAgLy9yZXR1cm4gZnJhY3Qoc2luKG4pKjQzNzU4LjU0NTMxMjMpOyAgIFxuICAgICAgICAgIHJldHVybiBmcmFjdChzaW4obikqNzU3MjguNTQ1MzEyMyk7IFxuICAgICAgfVxuICAgICAgXG4gICAgICBcbiAgICAgIGZsb2F0IG5vaXNlKCBpbiB2ZWMyIHggKSB7XG4gICAgICAgICAgdmVjMiBwID0gZmxvb3IoeCk7XG4gICAgICAgICAgdmVjMiBmID0gZnJhY3QoeCk7XG4gICAgICAgICAgZiA9IGYqZiooMy4wLTIuMCpmKTtcbiAgICAgICAgICBmbG9hdCBuID0gcC54ICsgcC55KjU3LjA7XG4gICAgICAgICAgcmV0dXJuIG1peChtaXgoIGhhc2gobiArIDAuMCksIGhhc2gobiArIDEuMCksIGYueCksIG1peChoYXNoKG4gKyA1Ny4wKSwgaGFzaChuICsgNTguMCksIGYueCksIGYueSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vLy8vLyBGQk0gLy8vLy8vIFxuICAgICAgXG4gICAgICBtYXQyIG0gPSBtYXQyKCAwLjYsIDAuNiwgLTAuNiwgMC44KTtcbiAgICAgIGZsb2F0IGZibSh2ZWMyIHApe1xuICAgICAgIFxuICAgICAgICAgIGZsb2F0IGYgPSAwLjA7XG4gICAgICAgICAgZiArPSAwLjUwMDAgKiBub2lzZShwKTsgcCAqPSBtICogMi4wMjtcbiAgICAgICAgICBmICs9IDAuMjUwMCAqIG5vaXNlKHApOyBwICo9IG0gKiAyLjAzO1xuICAgICAgICAgIGYgKz0gMC4xMjUwICogbm9pc2UocCk7IHAgKj0gbSAqIDIuMDE7XG4gICAgICAgICAgZiArPSAwLjA2MjUgKiBub2lzZShwKTsgcCAqPSBtICogMi4wNDtcbiAgICAgICAgICBmIC89IDAuOTM3NTtcbiAgICAgICAgICByZXR1cm4gZjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgXG4gICAgICB2b2lkIG1haW5JbWFnZShvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkKXtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBwaXhlbCByYXRpb1xuICAgICAgICAgIFxuICAgICAgICAgIHZlYzIgdXYgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eSA7ICBcbiAgICAgICAgICB2ZWMyIHAgPSAtIDEuICsgMi4gKiB1djtcbiAgICAgICAgICBwLnggKj0gaVJlc29sdXRpb24ueCAvIGlSZXNvbHV0aW9uLnk7XG4gICAgICAgICAgIFxuICAgICAgICAgIC8vIGRvbWFpbnNcbiAgICAgICAgICBcbiAgICAgICAgICBmbG9hdCByID0gc3FydChkb3QocCxwKSk7IFxuICAgICAgICAgIGZsb2F0IGEgPSBjb3MocC55ICogcC54KTsgIFxuICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAvLyBkaXN0b3J0aW9uXG4gICAgICAgICAgXG4gICAgICAgICAgZmxvYXQgZiA9IGZibSggNS4wICogcCk7XG4gICAgICAgICAgYSArPSBmYm0odmVjMigxLjkgLSBwLngsIDAuOSAqIGlUaW1lICsgcC55KSk7XG4gICAgICAgICAgYSArPSBmYm0oMC40ICogcCk7XG4gICAgICAgICAgciArPSBmYm0oMi45ICogcCk7XG4gICAgICAgICAgICAgXG4gICAgICAgICAgLy8gY29sb3JpemVcbiAgICAgICAgICBcbiAgICAgICAgICB2ZWMzIGNvbCA9IEJMVUU7XG4gICAgICAgICAgXG4gICAgICAgICAgZmxvYXQgZmYgPSAxLjAgLSBzbW9vdGhzdGVwKC0wLjQsIDEuMSwgbm9pc2UodmVjMigwLjUgKiBhLCAzLjMgKiBhKSkgKTsgICAgICAgIFxuICAgICAgICAgIGNvbCA9ICBtaXgoIGNvbCwgT1JBTkdFLCBmZik7XG4gICAgICAgICAgICAgXG4gICAgICAgICAgZmYgPSAxLjAgLSBzbW9vdGhzdGVwKC4wLCAyLjgsIHIgKTtcbiAgICAgICAgICBjb2wgKz0gIG1peCggY29sLCBCTEFDSywgIGZmKTtcbiAgICAgICAgICBcbiAgICAgICAgICBmZiAtPSAxLjAgLSBzbW9vdGhzdGVwKDAuMywgMC41LCBmYm0odmVjMigxLjAsIDQwLjAgKiBhKSkgKTsgXG4gICAgICAgICAgY29sID0gIG1peCggY29sLCBQSU5LLCAgZmYpOyAgXG4gICAgICAgICAgICBcbiAgICAgICAgICBmZiA9IDEuMCAtIHNtb290aHN0ZXAoMi4sIDIuOSwgYSAqIDEuNSApOyBcbiAgICAgICAgICBjb2wgPSAgbWl4KCBjb2wsIEJMQUNLLCAgZmYpOyAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgZnJhZ0NvbG9yID0gdmVjNChjb2wsIDEuKTtcbiAgICAgIH1cbiAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIobWF0Lm1hcC5vZmZzZXQueCsgTWF0aC5yYW5kb20oKSwgbWF0Lm1hcC5vZmZzZXQueCsgTWF0aC5yYW5kb20oKSkgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkgKyAwLjUpICogMTBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICB9XG59XG5cbmV4cG9ydCB7IExpcXVpZE1hcmJsZVNoYWRlciB9XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vd2lsbGlhbWNhc2V5bHVjYXMuZ2l0aHViLmlvL2NvcmUtY29tcG9uZW50cy9jZWNlZmI1MGU0MDhkMTA1LnBuZ1wiIiwiLy8gc2ltcGxlIHNoYWRlciB0YWtlbiBmcm9tIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc2xHV05cbmltcG9ydCBzaGFkZXJUb3lNYWluIGZyb20gXCIuL3NoYWRlclRveU1haW5cIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1PYmogZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybU9ialwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybV9wYXJhcyBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtX3BhcmFzXCJcbmltcG9ydCBzbWFsbE5vaXNlIGZyb20gJy4uL2Fzc2V0cy9zbWFsbC1ub2lzZS5wbmcnXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuaW50ZXJmYWNlIEV4dHJhQml0cyB7XG4gICAgbWFwOiBUSFJFRS5UZXh0dXJlXG59XG5cbmNvbnN0IHVuaWZvcm1zID0gT2JqZWN0LmFzc2lnbih7fSwgc2hhZGVyVG95VW5pZm9ybU9iaiwge1xuICAgIGlDaGFubmVsMDogeyB2YWx1ZTogbnVsbCB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgbm9pc2VUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2Vcbn0pXG5cbmxldCBHYWxheHlTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvL0NCU1xuICAgICAgICAvL1BhcmFsbGF4IHNjcm9sbGluZyBmcmFjdGFsIGdhbGF4eS5cbiAgICAgICAgLy9JbnNwaXJlZCBieSBKb3NoUCdzIFNpbXBsaWNpdHkgc2hhZGVyOiBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvbHNsR1dyXG4gICAgICAgIFxuICAgICAgICAvLyBodHRwOi8vd3d3LmZyYWN0YWxmb3J1bXMuY29tL25ldy10aGVvcmllcy1hbmQtcmVzZWFyY2gvdmVyeS1zaW1wbGUtZm9ybXVsYS1mb3ItZnJhY3RhbC1wYXR0ZXJucy9cbiAgICAgICAgZmxvYXQgZmllbGQoaW4gdmVjMyBwLGZsb2F0IHMpIHtcbiAgICAgICAgICAgIGZsb2F0IHN0cmVuZ3RoID0gNy4gKyAuMDMgKiBsb2coMS5lLTYgKyBmcmFjdChzaW4oaVRpbWUpICogNDM3My4xMSkpO1xuICAgICAgICAgICAgZmxvYXQgYWNjdW0gPSBzLzQuO1xuICAgICAgICAgICAgZmxvYXQgcHJldiA9IDAuO1xuICAgICAgICAgICAgZmxvYXQgdHcgPSAwLjtcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMjY7ICsraSkge1xuICAgICAgICAgICAgICAgIGZsb2F0IG1hZyA9IGRvdChwLCBwKTtcbiAgICAgICAgICAgICAgICBwID0gYWJzKHApIC8gbWFnICsgdmVjMygtLjUsIC0uNCwgLTEuNSk7XG4gICAgICAgICAgICAgICAgZmxvYXQgdyA9IGV4cCgtZmxvYXQoaSkgLyA3Lik7XG4gICAgICAgICAgICAgICAgYWNjdW0gKz0gdyAqIGV4cCgtc3RyZW5ndGggKiBwb3coYWJzKG1hZyAtIHByZXYpLCAyLjIpKTtcbiAgICAgICAgICAgICAgICB0dyArPSB3O1xuICAgICAgICAgICAgICAgIHByZXYgPSBtYWc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWF4KDAuLCA1LiAqIGFjY3VtIC8gdHcgLSAuNyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExlc3MgaXRlcmF0aW9ucyBmb3Igc2Vjb25kIGxheWVyXG4gICAgICAgIGZsb2F0IGZpZWxkMihpbiB2ZWMzIHAsIGZsb2F0IHMpIHtcbiAgICAgICAgICAgIGZsb2F0IHN0cmVuZ3RoID0gNy4gKyAuMDMgKiBsb2coMS5lLTYgKyBmcmFjdChzaW4oaVRpbWUpICogNDM3My4xMSkpO1xuICAgICAgICAgICAgZmxvYXQgYWNjdW0gPSBzLzQuO1xuICAgICAgICAgICAgZmxvYXQgcHJldiA9IDAuO1xuICAgICAgICAgICAgZmxvYXQgdHcgPSAwLjtcbiAgICAgICAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgMTg7ICsraSkge1xuICAgICAgICAgICAgICAgIGZsb2F0IG1hZyA9IGRvdChwLCBwKTtcbiAgICAgICAgICAgICAgICBwID0gYWJzKHApIC8gbWFnICsgdmVjMygtLjUsIC0uNCwgLTEuNSk7XG4gICAgICAgICAgICAgICAgZmxvYXQgdyA9IGV4cCgtZmxvYXQoaSkgLyA3Lik7XG4gICAgICAgICAgICAgICAgYWNjdW0gKz0gdyAqIGV4cCgtc3RyZW5ndGggKiBwb3coYWJzKG1hZyAtIHByZXYpLCAyLjIpKTtcbiAgICAgICAgICAgICAgICB0dyArPSB3O1xuICAgICAgICAgICAgICAgIHByZXYgPSBtYWc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbWF4KDAuLCA1LiAqIGFjY3VtIC8gdHcgLSAuNyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbnJhbmQzKCB2ZWMyIGNvIClcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBhID0gZnJhY3QoIGNvcyggY28ueCo4LjNlLTMgKyBjby55ICkqdmVjMygxLjNlNSwgNC43ZTUsIDIuOWU1KSApO1xuICAgICAgICAgICAgdmVjMyBiID0gZnJhY3QoIHNpbiggY28ueCowLjNlLTMgKyBjby55ICkqdmVjMyg4LjFlNSwgMS4wZTUsIDAuMWU1KSApO1xuICAgICAgICAgICAgdmVjMyBjID0gbWl4KGEsIGIsIDAuNSk7XG4gICAgICAgICAgICByZXR1cm4gYztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIHZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkICkge1xuICAgICAgICAgICAgdmVjMiB1diA9IDIuICogZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHkgLSAxLjtcbiAgICAgICAgICAgIHZlYzIgdXZzID0gdXYgKiBpUmVzb2x1dGlvbi54eSAvIG1heChpUmVzb2x1dGlvbi54LCBpUmVzb2x1dGlvbi55KTtcbiAgICAgICAgICAgIHZlYzMgcCA9IHZlYzModXZzIC8gNC4sIDApICsgdmVjMygxLiwgLTEuMywgMC4pO1xuICAgICAgICAgICAgcCArPSAuMiAqIHZlYzMoc2luKGlUaW1lIC8gMTYuKSwgc2luKGlUaW1lIC8gMTIuKSwgIHNpbihpVGltZSAvIDEyOC4pKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgZnJlcXNbNF07XG4gICAgICAgICAgICAvL1NvdW5kXG4gICAgICAgICAgICBmcmVxc1swXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4wMSwgMC4yNSApICkueDtcbiAgICAgICAgICAgIGZyZXFzWzFdID0gdGV4dHVyZSggaUNoYW5uZWwwLCB2ZWMyKCAwLjA3LCAwLjI1ICkgKS54O1xuICAgICAgICAgICAgZnJlcXNbMl0gPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHZlYzIoIDAuMTUsIDAuMjUgKSApLng7XG4gICAgICAgICAgICBmcmVxc1szXSA9IHRleHR1cmUoIGlDaGFubmVsMCwgdmVjMiggMC4zMCwgMC4yNSApICkueDtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCB0ID0gZmllbGQocCxmcmVxc1syXSk7XG4gICAgICAgICAgICBmbG9hdCB2ID0gKDEuIC0gZXhwKChhYnModXYueCkgLSAxLikgKiA2LikpICogKDEuIC0gZXhwKChhYnModXYueSkgLSAxLikgKiA2LikpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvL1NlY29uZCBMYXllclxuICAgICAgICAgICAgdmVjMyBwMiA9IHZlYzModXZzIC8gKDQuK3NpbihpVGltZSowLjExKSowLjIrMC4yK3NpbihpVGltZSowLjE1KSowLjMrMC40KSwgMS41KSArIHZlYzMoMi4sIC0xLjMsIC0xLik7XG4gICAgICAgICAgICBwMiArPSAwLjI1ICogdmVjMyhzaW4oaVRpbWUgLyAxNi4pLCBzaW4oaVRpbWUgLyAxMi4pLCAgc2luKGlUaW1lIC8gMTI4LikpO1xuICAgICAgICAgICAgZmxvYXQgdDIgPSBmaWVsZDIocDIsZnJlcXNbM10pO1xuICAgICAgICAgICAgdmVjNCBjMiA9IG1peCguNCwgMS4sIHYpICogdmVjNCgxLjMgKiB0MiAqIHQyICogdDIgLDEuOCAgKiB0MiAqIHQyICwgdDIqIGZyZXFzWzBdLCB0Mik7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9MZXQncyBhZGQgc29tZSBzdGFyc1xuICAgICAgICAgICAgLy9UaGFua3MgdG8gaHR0cDovL2dsc2wuaGVyb2t1LmNvbS9lIzY5MDQuMFxuICAgICAgICAgICAgdmVjMiBzZWVkID0gcC54eSAqIDIuMDtcdFxuICAgICAgICAgICAgc2VlZCA9IGZsb29yKHNlZWQgKiBpUmVzb2x1dGlvbi54KTtcbiAgICAgICAgICAgIHZlYzMgcm5kID0gbnJhbmQzKCBzZWVkICk7XG4gICAgICAgICAgICB2ZWM0IHN0YXJjb2xvciA9IHZlYzQocG93KHJuZC55LDQwLjApKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy9TZWNvbmQgTGF5ZXJcbiAgICAgICAgICAgIHZlYzIgc2VlZDIgPSBwMi54eSAqIDIuMDtcbiAgICAgICAgICAgIHNlZWQyID0gZmxvb3Ioc2VlZDIgKiBpUmVzb2x1dGlvbi54KTtcbiAgICAgICAgICAgIHZlYzMgcm5kMiA9IG5yYW5kMyggc2VlZDIgKTtcbiAgICAgICAgICAgIHN0YXJjb2xvciArPSB2ZWM0KHBvdyhybmQyLnksNDAuMCkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmcmFnQ29sb3IgPSBtaXgoZnJlcXNbM10tLjMsIDEuLCB2KSAqIHZlYzQoMS41KmZyZXFzWzJdICogdCAqIHQqIHQgLCAxLjIqZnJlcXNbMV0gKiB0ICogdCwgZnJlcXNbM10qdCwgMS4wKStjMitzdGFyY29sb3I7XG4gICAgICAgIH1cbiAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMDAwMDBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICB9XG59XG5cbmV4cG9ydCB7IEdhbGF4eVNoYWRlciB9XG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzRzR1N6Y1xuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL3NtYWxsLW5vaXNlLnBuZydcbmltcG9ydCB7IFNoYWRlckV4dGVuc2lvbiwgRXh0ZW5kZWRNYXRlcmlhbCB9IGZyb20gJy4uL3V0aWxzL01hdGVyaWFsTW9kaWZpZXInO1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxuY29uc3QgdW5pZm9ybXMgPSBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqLCB7XG4gICAgaUNoYW5uZWwwOiB7IHZhbHVlOiBudWxsIH1cbn0pXG5cbmNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKClcbnZhciBub2lzZVRleDogVEhSRUUuVGV4dHVyZTtcbmxvYWRlci5sb2FkKHNtYWxsTm9pc2UsIChub2lzZSkgPT4ge1xuICAgIG5vaXNlLm1pbkZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2UubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBub2lzZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgbm9pc2VUZXggPSBub2lzZVxufSlcblxubGV0IExhY2VUdW5uZWxTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzICsgZ2xzbGBcbiAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMDtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICAvLyBDcmVhdGVkIGJ5IFN0ZXBoYW5lIEN1aWxsZXJkaWVyIC0gQWlla2ljay8yMDE1ICh0d2l0dGVyOkBhaWVraWNrKVxuICAgICAgICAvLyBMaWNlbnNlIENyZWF0aXZlIENvbW1vbnMgQXR0cmlidXRpb24tTm9uQ29tbWVyY2lhbC1TaGFyZUFsaWtlIDMuMCBVbnBvcnRlZCBMaWNlbnNlLlxuICAgICAgICAvLyBUdW5lZCB2aWEgWFNoYWRlIChodHRwOi8vd3d3LmZ1bnBhcmFkaWdtLmNvbS94c2hhZGUvKVxuICAgICAgICBcbiAgICAgICAgdmVjMiBsdF9tbyA9IHZlYzIoMCk7XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBsdF9wbiggaW4gdmVjMyB4ICkgLy8gaXEgbm9pc2VcbiAgICAgICAge1xuICAgICAgICAgICAgdmVjMyBwID0gZmxvb3IoeCk7XG4gICAgICAgICAgICB2ZWMzIGYgPSBmcmFjdCh4KTtcbiAgICAgICAgICAgIGYgPSBmKmYqKDMuMC0yLjAqZik7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gKHAueHkrdmVjMigzNy4wLDE3LjApKnAueikgKyBmLnh5O1xuICAgICAgICAgICAgdmVjMiByZyA9IHRleHR1cmUoaUNoYW5uZWwwLCAodXYrIDAuNSkvMjU2LjAsIC0xMDAuMCApLnl4O1xuICAgICAgICAgICAgcmV0dXJuIC0xLjArMi40Km1peCggcmcueCwgcmcueSwgZi56ICk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzIgbHRfcGF0aChmbG9hdCB0KVxuICAgICAgICB7XG4gICAgICAgICAgICByZXR1cm4gdmVjMihjb3ModCowLjIpLCBzaW4odCowLjIpKSAqIDIuO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYXQzIGx0X214ID0gbWF0MygxLDAsMCwwLDcsMCwwLDAsNyk7XG4gICAgICAgIGNvbnN0IG1hdDMgbHRfbXkgPSBtYXQzKDcsMCwwLDAsMSwwLDAsMCw3KTtcbiAgICAgICAgY29uc3QgbWF0MyBsdF9teiA9IG1hdDMoNywwLDAsMCw3LDAsMCwwLDEpO1xuICAgICAgICBcbiAgICAgICAgLy8gYmFzZSBvbiBzaGFuZSB0ZWNoIGluIHNoYWRlciA6IE9uZSBUd2VldCBDZWxsdWxhciBQYXR0ZXJuXG4gICAgICAgIGZsb2F0IGx0X2Z1bmModmVjMyBwKVxuICAgICAgICB7XG4gICAgICAgICAgICBwID0gZnJhY3QocC82OC42KSAtIC41O1xuICAgICAgICAgICAgcmV0dXJuIG1pbihtaW4oYWJzKHAueCksIGFicyhwLnkpKSwgYWJzKHAueikpICsgMC4xO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIGx0X2VmZmVjdCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHAgKj0gbHRfbXogKiBsdF9teCAqIGx0X215ICogc2luKHAuenh5KTsgLy8gc2luKHAuenh5KSBpcyBiYXNlZCBvbiBpcSB0ZWNoIGZyb20gc2hhZGVyIChTY3VscHR1cmUgSUlJKVxuICAgICAgICAgICAgcmV0dXJuIHZlYzMobWluKG1pbihsdF9mdW5jKHAqbHRfbXgpLCBsdF9mdW5jKHAqbHRfbXkpKSwgbHRfZnVuYyhwKmx0X216KSkvLjYpO1xuICAgICAgICB9XG4gICAgICAgIC8vXG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X2Rpc3BsYWNlbWVudCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgY29sID0gMS4tbHRfZWZmZWN0KHAqMC44KTtcbiAgICAgICAgICAgICAgIGNvbCA9IGNsYW1wKGNvbCwgLS41LCAxLik7XG4gICAgICAgICAgICBmbG9hdCBkaXN0ID0gZG90KGNvbCx2ZWMzKDAuMDIzKSk7XG4gICAgICAgICAgICBjb2wgPSBzdGVwKGNvbCwgdmVjMygwLjgyKSk7Ly8gYmxhY2sgbGluZSBvbiBzaGFwZVxuICAgICAgICAgICAgcmV0dXJuIHZlYzQoZGlzdCxjb2wpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X21hcCh2ZWMzIHApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHAueHkgLT0gbHRfcGF0aChwLnopO1xuICAgICAgICAgICAgdmVjNCBkaXNwID0gbHRfZGlzcGxhY2VtZW50KHNpbihwLnp4eSoyLikqMC44KTtcbiAgICAgICAgICAgIHAgKz0gc2luKHAuenh5Ki41KSoxLjU7XG4gICAgICAgICAgICBmbG9hdCBsID0gbGVuZ3RoKHAueHkpIC0gNC47XG4gICAgICAgICAgICByZXR1cm4gdmVjNChtYXgoLWwgKyAwLjA5LCBsKSAtIGRpc3AueCwgZGlzcC55encpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB2ZWMzIGx0X25vciggaW4gdmVjMyBwb3MsIGZsb2F0IHByZWMgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMzIGVwcyA9IHZlYzMoIHByZWMsIDAuLCAwLiApO1xuICAgICAgICAgICAgdmVjMyBsdF9ub3IgPSB2ZWMzKFxuICAgICAgICAgICAgICAgIGx0X21hcChwb3MrZXBzLnh5eSkueCAtIGx0X21hcChwb3MtZXBzLnh5eSkueCxcbiAgICAgICAgICAgICAgICBsdF9tYXAocG9zK2Vwcy55eHkpLnggLSBsdF9tYXAocG9zLWVwcy55eHkpLngsXG4gICAgICAgICAgICAgICAgbHRfbWFwKHBvcytlcHMueXl4KS54IC0gbHRfbWFwKHBvcy1lcHMueXl4KS54ICk7XG4gICAgICAgICAgICByZXR1cm4gbm9ybWFsaXplKGx0X25vcik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIFxuICAgICAgICB2ZWM0IGx0X2xpZ2h0KHZlYzMgcm8sIHZlYzMgcmQsIGZsb2F0IGQsIHZlYzMgbGlnaHRwb3MsIHZlYzMgbGMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzMgcCA9IHJvICsgcmQgKiBkO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBvcmlnaW5hbCBub3JtYWxlXG4gICAgICAgICAgICB2ZWMzIG4gPSBsdF9ub3IocCwgMC4xKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdmVjMyBsaWdodGRpciA9IGxpZ2h0cG9zIC0gcDtcbiAgICAgICAgICAgIGZsb2F0IGxpZ2h0bGVuID0gbGVuZ3RoKGxpZ2h0cG9zIC0gcCk7XG4gICAgICAgICAgICBsaWdodGRpciAvPSBsaWdodGxlbjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgYW1iID0gMC42O1xuICAgICAgICAgICAgZmxvYXQgZGlmZiA9IGNsYW1wKCBkb3QoIG4sIGxpZ2h0ZGlyICksIDAuMCwgMS4wICk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGJyZGYgPSB2ZWMzKDApO1xuICAgICAgICAgICAgYnJkZiArPSBhbWIgKiB2ZWMzKDAuMiwwLjUsMC4zKTsgLy8gY29sb3IgbWF0XG4gICAgICAgICAgICBicmRmICs9IGRpZmYgKiAwLjY7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGJyZGYgPSBtaXgoYnJkZiwgbHRfbWFwKHApLnl6dywgMC41KTsvLyBtZXJnZSBsaWdodCBhbmQgYmxhY2sgbGluZSBwYXR0ZXJuXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gdmVjNChicmRmLCBsaWdodGxlbik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHZlYzMgbHRfc3RhcnModmVjMiB1diwgdmVjMyByZCwgZmxvYXQgZCwgdmVjMiBzLCB2ZWMyIGcpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHV2ICo9IDgwMC4gKiBzLngvcy55O1xuICAgICAgICAgICAgZmxvYXQgayA9IGZyYWN0KCBjb3ModXYueSAqIDAuMDAwMSArIHV2LngpICogOTAwMDAuKTtcbiAgICAgICAgICAgIGZsb2F0IHZhciA9IHNpbihsdF9wbihkKjAuNityZCoxODIuMTQpKSowLjUrMC41Oy8vIHRoYW5rIHRvIGtsZW1zIGZvciB0aGUgdmFyaWF0aW9uIGluIG15IHNoYWRlciBzdWJsdW1pbmljXG4gICAgICAgICAgICB2ZWMzIGNvbCA9IHZlYzMobWl4KDAuLCAxLiwgdmFyKnBvdyhrLCAyMDAuKSkpOy8vIGNvbWUgZnJvbSBDQlMgU2hhZGVyIFwiU2ltcGxpY2l0eVwiIDogaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zbEdXTlxuICAgICAgICAgICAgcmV0dXJuIGNvbDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8vLy8vLy9NQUlOLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgcyA9IGlSZXNvbHV0aW9uLnh5O1xuICAgICAgICAgICAgdmVjMiBnID0gZnJhZ0Nvb3JkO1xuICAgICAgICAgICAgXG4gICAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgdGltZSA9IGlUaW1lKjEuMDtcbiAgICAgICAgICAgIGZsb2F0IGNhbV9hID0gdGltZTsgLy8gYW5nbGUgelxuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBjYW1fZSA9IDMuMjsgLy8gZWxldmF0aW9uXG4gICAgICAgICAgICBmbG9hdCBjYW1fZCA9IDQuOyAvLyBkaXN0YW5jZSB0byBvcmlnaW4gYXhpc1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBtYXhkID0gNDAuOyAvLyByYXkgbWFyY2hpbmcgZGlzdGFuY2UgbWF4XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzIgdXYgPSAoZyoyLi1zKS9zLnk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgY29sID0gdmVjMygwLik7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyBybyA9IHZlYzMobHRfcGF0aCh0aW1lKStsdF9tbyx0aW1lKTtcbiAgICAgICAgICAgICAgdmVjMyBjdiA9IHZlYzMobHRfcGF0aCh0aW1lKzAuMSkrbHRfbW8sdGltZSswLjEpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGN1PXZlYzMoMCwxLDApO1xuICAgICAgICAgICAgICB2ZWMzIHJvdiA9IG5vcm1hbGl6ZShjdi1ybyk7XG4gICAgICAgICAgICB2ZWMzIHUgPSBub3JtYWxpemUoY3Jvc3MoY3Uscm92KSk7XG4gICAgICAgICAgICAgIHZlYzMgdiA9IGNyb3NzKHJvdix1KTtcbiAgICAgICAgICAgICAgdmVjMyByZCA9IG5vcm1hbGl6ZShyb3YgKyB1di54KnUgKyB1di55KnYpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIGN1cnZlMCA9IHZlYzMoMCk7XG4gICAgICAgICAgICB2ZWMzIGN1cnZlMSA9IHZlYzMoMCk7XG4gICAgICAgICAgICB2ZWMzIGN1cnZlMiA9IHZlYzMoMCk7XG4gICAgICAgICAgICBmbG9hdCBvdXRTdGVwID0gMC47XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGFvID0gMC47IC8vIGFvIGxvdyBjb3N0IDopXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IHN0ID0gMC47XG4gICAgICAgICAgICBmbG9hdCBkID0gMC47XG4gICAgICAgICAgICBmb3IoaW50IGk9MDtpPDI1MDtpKyspXG4gICAgICAgICAgICB7ICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKHN0PDAuMDI1KmxvZyhkKmQvc3QvMWU1KXx8ZD5tYXhkKSBicmVhazsvLyBzcGVjaWFsIGJyZWFrIGNvbmRpdGlvbiBmb3IgbG93IHRoaWNrbmVzcyBvYmplY3RcbiAgICAgICAgICAgICAgICBzdCA9IGx0X21hcChybytyZCpkKS54O1xuICAgICAgICAgICAgICAgIGQgKz0gc3QgKiAwLjY7IC8vIHRoZSAwLjYgaXMgc2VsZWN0ZWQgYWNjb3JkaW5nIHRvIHRoZSAxZTUgYW5kIHRoZSAwLjAyNSBvZiB0aGUgYnJlYWsgY29uZGl0aW9uIGZvciBnb29kIHJlc3VsdFxuICAgICAgICAgICAgICAgIGFvKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkIDwgbWF4ZClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB2ZWM0IGxpID0gbHRfbGlnaHQocm8sIHJkLCBkLCBybywgdmVjMygwKSk7Ly8gcG9pbnQgbGlnaHQgb24gdGhlIGNhbVxuICAgICAgICAgICAgICAgIGNvbCA9IGxpLnh5ei8obGkudyowLjIpOy8vIGNoZWFwIGxpZ2h0IGF0dGVudWF0aW9uXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgY29sID0gbWl4KHZlYzMoMS4tYW8vMTAwLiksIGNvbCwgMC41KTsvLyBsb3cgY29zdCBhbyA6KVxuICAgICAgICAgICAgICAgIGZyYWdDb2xvci5yZ2IgPSBtaXgoIGNvbCwgdmVjMygwKSwgMS4wLWV4cCggLTAuMDAzKmQqZCApICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICBmcmFnQ29sb3IucmdiID0gbHRfc3RhcnModXYsIHJkLCBkLCBzLCBmcmFnQ29vcmQpOy8vIHN0YXJzIGJnXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHZpZ25ldHRlXG4gICAgICAgICAgICB2ZWMyIHEgPSBmcmFnQ29vcmQvcztcbiAgICAgICAgICAgIGZyYWdDb2xvci5yZ2IgKj0gMC41ICsgMC41KnBvdyggMTYuMCpxLngqcS55KigxLjAtcS54KSooMS4wLXEueSksIDAuMjUgKTsgLy8gaXEgdmlnbmV0dGVcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgIGAsXG4gICAgcmVwbGFjZU1hcDogc2hhZGVyVG95TWFpblxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpICsgMC41KSAqIDEwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMSkgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgfVxufVxuXG5leHBvcnQgeyBMYWNlVHVubmVsU2hhZGVyIH1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly93aWxsaWFtY2FzZXlsdWNhcy5naXRodWIuaW8vY29yZS1jb21wb25lbnRzL2YyN2UwMTA0NjA1ZjBjZDcucG5nXCIiLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01kZkdSWFxuXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJztcblxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHNtYWxsTm9pc2UgZnJvbSAnLi4vYXNzZXRzL25vaXNlLTI1Ni5wbmcnXG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBpQ2hhbm5lbFJlc29sdXRpb246IHsgdmFsdWU6IFsgbmV3IFRIUkVFLlZlY3RvcjMoMSwxLDEpLCBuZXcgVEhSRUUuVmVjdG9yMygxLDEsMSksIG5ldyBUSFJFRS5WZWN0b3IzKDEsMSwxKSwgbmV3IFRIUkVFLlZlY3RvcjMoMSwxLDEpXSB9XG59KVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgbm9pc2VUZXg6IFRIUkVFLlRleHR1cmU7XG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2VcbiAgICBjb25zb2xlLmxvZyggXCJub2lzZSB0ZXh0dXJlIHNpemU6IFwiLCBub2lzZS5pbWFnZS53aWR0aCxub2lzZS5pbWFnZS5oZWlnaHQgKTtcbn0pXG5cbmxldCBGaXJlVHVubmVsU2hhZGVyOiBTaGFkZXJFeHRlbnNpb24gPSB7XG4gICAgdW5pZm9ybXM6IHVuaWZvcm1zLFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3Jtczogc2hhZGVyVG95VW5pZm9ybV9wYXJhcyArIGdsc2xgXG4gICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICB1bmlmb3JtIHZlYzMgaUNoYW5uZWxSZXNvbHV0aW9uWzRdO1xuICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIC8vIENyZWF0ZWQgYnkgaW5pZ28gcXVpbGV6IC0gaXEvMjAxM1xuLy8gSSBzaGFyZSB0aGlzIHBpZWNlIChhcnQgYW5kIGNvZGUpIGhlcmUgaW4gU2hhZGVydG95IGFuZCB0aHJvdWdoIGl0cyBQdWJsaWMgQVBJLCBvbmx5IGZvciBlZHVjYXRpb25hbCBwdXJwb3Nlcy4gXG4vLyBZb3UgY2Fubm90IHVzZSwgc2VsbCwgc2hhcmUgb3IgaG9zdCB0aGlzIHBpZWNlIG9yIG1vZGlmaWNhdGlvbnMgb2YgaXQgYXMgcGFydCBvZiB5b3VyIG93biBjb21tZXJjaWFsIG9yIG5vbi1jb21tZXJjaWFsIHByb2R1Y3QsIHdlYnNpdGUgb3IgcHJvamVjdC5cbi8vIFlvdSBjYW4gc2hhcmUgYSBsaW5rIHRvIGl0IG9yIGFuIHVubW9kaWZpZWQgc2NyZWVuc2hvdCBvZiBpdCBwcm92aWRlZCB5b3UgYXR0cmlidXRlIFwiYnkgSW5pZ28gUXVpbGV6LCBAaXF1aWxlemxlcyBhbmQgaXF1aWxlemxlcy5vcmdcIi4gXG4vLyBJZiB5b3UgYXJlIGEgdGVjaGVyLCBsZWN0dXJlciwgZWR1Y2F0b3Igb3Igc2ltaWxhciBhbmQgdGhlc2UgY29uZGl0aW9ucyBhcmUgdG9vIHJlc3RyaWN0aXZlIGZvciB5b3VyIG5lZWRzLCBwbGVhc2UgY29udGFjdCBtZSBhbmQgd2UnbGwgd29yayBpdCBvdXQuXG5cbmZsb2F0IGZpcmVfbm9pc2UoIGluIHZlYzMgeCApXG57XG4gICAgdmVjMyBwID0gZmxvb3IoeCk7XG4gICAgdmVjMyBmID0gZnJhY3QoeCk7XG5cdGYgPSBmKmYqKDMuMC0yLjAqZik7XG5cdFxuXHR2ZWMyIHV2ID0gKHAueHkrdmVjMigzNy4wLDE3LjApKnAueikgKyBmLnh5O1xuXHR2ZWMyIHJnID0gdGV4dHVyZUxvZCggaUNoYW5uZWwwLCAodXYrIDAuNSkvMjU2LjAsIDAuMCApLnl4O1xuXHRyZXR1cm4gbWl4KCByZy54LCByZy55LCBmLnogKTtcbn1cblxudmVjNCBmaXJlX21hcCggdmVjMyBwIClcbntcblx0ZmxvYXQgZGVuID0gMC4yIC0gcC55O1xuXG4gICAgLy8gaW52ZXJ0IHNwYWNlXHRcblx0cCA9IC03LjAqcC9kb3QocCxwKTtcblxuICAgIC8vIHR3aXN0IHNwYWNlXHRcblx0ZmxvYXQgY28gPSBjb3MoZGVuIC0gMC4yNSppVGltZSk7XG5cdGZsb2F0IHNpID0gc2luKGRlbiAtIDAuMjUqaVRpbWUpO1xuXHRwLnh6ID0gbWF0Mihjbywtc2ksc2ksY28pKnAueHo7XG5cbiAgICAvLyBzbW9rZVx0XG5cdGZsb2F0IGY7XG5cdHZlYzMgcSA9IHAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7O1xuICAgIGYgID0gMC41MDAwMCpmaXJlX25vaXNlKCBxICk7IHEgPSBxKjIuMDIgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTtcbiAgICBmICs9IDAuMjUwMDAqZmlyZV9ub2lzZSggcSApOyBxID0gcSoyLjAzIC0gdmVjMygwLjAsMS4wLDAuMCkqaVRpbWU7XG4gICAgZiArPSAwLjEyNTAwKmZpcmVfbm9pc2UoIHEgKTsgcSA9IHEqMi4wMSAtIHZlYzMoMC4wLDEuMCwwLjApKmlUaW1lO1xuICAgIGYgKz0gMC4wNjI1MCpmaXJlX25vaXNlKCBxICk7IHEgPSBxKjIuMDIgLSB2ZWMzKDAuMCwxLjAsMC4wKSppVGltZTtcbiAgICBmICs9IDAuMDMxMjUqZmlyZV9ub2lzZSggcSApO1xuXG5cdGRlbiA9IGNsYW1wKCBkZW4gKyA0LjAqZiwgMC4wLCAxLjAgKTtcblx0XG5cdHZlYzMgY29sID0gbWl4KCB2ZWMzKDEuMCwwLjksMC44KSwgdmVjMygwLjQsMC4xNSwwLjEpLCBkZW4gKSArIDAuMDUqc2luKHApO1xuXHRcblx0cmV0dXJuIHZlYzQoIGNvbCwgZGVuICk7XG59XG5cbnZlYzMgcmF5bWFyY2goIGluIHZlYzMgcm8sIGluIHZlYzMgcmQsIGluIHZlYzIgcGl4ZWwgKVxue1xuXHR2ZWM0IHN1bSA9IHZlYzQoIDAuMCApO1xuXG5cdGZsb2F0IHQgPSAwLjA7XG5cbiAgICAvLyBkaXRoZXJpbmdcdFxuXHR0ICs9IDAuMDUqdGV4dHVyZUxvZCggaUNoYW5uZWwwLCBwaXhlbC54eS9pQ2hhbm5lbFJlc29sdXRpb25bMF0ueCwgMC4wICkueDtcblx0XG5cdGZvciggaW50IGk9MDsgaTwxMDA7IGkrKyApXG5cdHtcblx0XHRpZiggc3VtLmEgPiAwLjk5ICkgYnJlYWs7XG5cdFx0XG5cdFx0dmVjMyBwb3MgPSBybyArIHQqcmQ7XG5cdFx0dmVjNCBjb2wgPSBmaXJlX21hcCggcG9zICk7XG5cdFx0XG5cdFx0Y29sLnh5eiAqPSBtaXgoIDMuMSp2ZWMzKDEuMCwwLjUsMC4wNSksIHZlYzMoMC40OCwwLjUzLDAuNSksIGNsYW1wKCAocG9zLnktMC4yKS8yLjAsIDAuMCwgMS4wICkgKTtcblx0XHRcblx0XHRjb2wuYSAqPSAwLjY7XG5cdFx0Y29sLnJnYiAqPSBjb2wuYTtcblxuXHRcdHN1bSA9IHN1bSArIGNvbCooMS4wIC0gc3VtLmEpO1x0XG5cblx0XHR0ICs9IDAuMDU7XG5cdH1cblxuXHRyZXR1cm4gY2xhbXAoIHN1bS54eXosIDAuMCwgMS4wICk7XG59XG5cbnZvaWQgbWFpbkltYWdlKCBvdXQgdmVjNCBmcmFnQ29sb3IsIGluIHZlYzIgZnJhZ0Nvb3JkIClcbntcblx0dmVjMiBxID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueHk7XG4gICAgdmVjMiBwID0gLTEuMCArIDIuMCpxO1xuICAgIHAueCAqPSBpUmVzb2x1dGlvbi54LyBpUmVzb2x1dGlvbi55O1xuXHRcbiAgICB2ZWMyIG1vID0gdmVjMigwLjUsMC41KTsgLy9pTW91c2UueHkgLyBpUmVzb2x1dGlvbi54eTtcbiAgICAvL2lmKCBpTW91c2Uudzw9MC4wMDAwMSApIG1vPXZlYzIoMC4wKTtcblx0XG4gICAgLy8gY2FtZXJhXG4gICAgdmVjMyBybyA9IDQuMCpub3JtYWxpemUodmVjMyhjb3MoMy4wKm1vLngpLCAxLjQgLSAxLjAqKG1vLnktLjEpLCBzaW4oMy4wKm1vLngpKSk7XG5cdHZlYzMgdGEgPSB2ZWMzKDAuMCwgMS4wLCAwLjApO1xuXHRmbG9hdCBjciA9IDAuNSpjb3MoMC43KmlUaW1lKTtcblx0XG4gICAgLy8gc2hha2VcdFx0XG5cdHJvICs9IDAuMSooLTEuMCsyLjAqdGV4dHVyZUxvZCggaUNoYW5uZWwwLCBpVGltZSp2ZWMyKDAuMDEwLDAuMDE0KSwgMC4wICkueHl6KTtcblx0dGEgKz0gMC4xKigtMS4wKzIuMCp0ZXh0dXJlTG9kKCBpQ2hhbm5lbDAsIGlUaW1lKnZlYzIoMC4wMTMsMC4wMDgpLCAwLjAgKS54eXopO1xuXHRcblx0Ly8gYnVpbGQgcmF5XG4gICAgdmVjMyB3dyA9IG5vcm1hbGl6ZSggdGEgLSBybyk7XG4gICAgdmVjMyB1dSA9IG5vcm1hbGl6ZShjcm9zcyggdmVjMyhzaW4oY3IpLGNvcyhjciksMC4wKSwgd3cgKSk7XG4gICAgdmVjMyB2diA9IG5vcm1hbGl6ZShjcm9zcyh3dyx1dSkpO1xuICAgIHZlYzMgcmQgPSBub3JtYWxpemUoIHAueCp1dSArIHAueSp2diArIDIuMCp3dyApO1xuXHRcbiAgICAvLyByYXltYXJjaFx0XG5cdHZlYzMgY29sID0gcmF5bWFyY2goIHJvLCByZCwgZnJhZ0Nvb3JkICk7XG5cdFxuXHQvLyBjb250cmFzdCBhbmQgdmlnbmV0dGluZ1x0XG5cdGNvbCA9IGNvbCowLjUgKyAwLjUqY29sKmNvbCooMy4wLTIuMCpjb2wpO1xuXHRjb2wgKj0gMC4yNSArIDAuNzUqcG93KCAxNi4wKnEueCpxLnkqKDEuMC1xLngpKigxLjAtcS55KSwgMC4xICk7XG5cdFxuICAgIGZyYWdDb2xvciA9IHZlYzQoIGNvbCwgMS4wICk7XG59XG5cbiAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMDAwMDBcbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaVRpbWUudmFsdWUgPSAodGltZSAqIDAuMDAxKSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWwwLnZhbHVlID0gbm9pc2VUZXhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaUNoYW5uZWxSZXNvbHV0aW9uLnZhbHVlWzBdLnggPSBub2lzZVRleC5pbWFnZS53aWR0aFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbFJlc29sdXRpb24udmFsdWVbMF0ueSA9IG5vaXNlVGV4LmltYWdlLmhlaWdodFxuICAgIH1cbn1cblxuZXhwb3J0IHsgRmlyZVR1bm5lbFNoYWRlciB9XG4iLCIvLyBzaW1wbGUgc2hhZGVyIHRha2VuIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3LzdsZlhSQlxuaW1wb3J0IHNoYWRlclRveU1haW4gZnJvbSBcIi4vc2hhZGVyVG95TWFpblwiXG5pbXBvcnQgc2hhZGVyVG95VW5pZm9ybU9iaiBmcm9tIFwiLi9zaGFkZXJUb3lVbmlmb3JtT2JqXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtX3BhcmFzIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1fcGFyYXNcIlxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5sZXQgTWlzdFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiBPYmplY3QuYXNzaWduKHt9LCBzaGFkZXJUb3lVbmlmb3JtT2JqKSxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMsXG4gICAgICAgIGZ1bmN0aW9uczogZ2xzbGBcblxuICAgICAgICBmbG9hdCBtcmFuZCh2ZWMyIGNvb3JkcylcbiAgICAgICAge1xuICAgICAgICAgICAgcmV0dXJuIGZyYWN0KHNpbihkb3QoY29vcmRzLCB2ZWMyKDU2LjM0NTYsNzguMzQ1NikpICogNS4wKSAqIDEwMDAwLjApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtbm9pc2UodmVjMiBjb29yZHMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgaSA9IGZsb29yKGNvb3Jkcyk7XG4gICAgICAgICAgICB2ZWMyIGYgPSBmcmFjdChjb29yZHMpO1xuICAgICAgICBcbiAgICAgICAgICAgIGZsb2F0IGEgPSBtcmFuZChpKTtcbiAgICAgICAgICAgIGZsb2F0IGIgPSBtcmFuZChpICsgdmVjMigxLjAsIDAuMCkpO1xuICAgICAgICAgICAgZmxvYXQgYyA9IG1yYW5kKGkgKyB2ZWMyKDAuMCwgMS4wKSk7XG4gICAgICAgICAgICBmbG9hdCBkID0gbXJhbmQoaSArIHZlYzIoMS4wLCAxLjApKTtcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMyIGN1YmljID0gZiAqIGYgKiAoMy4wIC0gMi4wICogZik7XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG1peChhLCBiLCBjdWJpYy54KSArIChjIC0gYSkgKiBjdWJpYy55ICogKDEuMCAtIGN1YmljLngpICsgKGQgLSBiKSAqIGN1YmljLnggKiBjdWJpYy55O1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBmYm0odmVjMiBjb29yZHMpXG4gICAgICAgIHtcbiAgICAgICAgICAgIGZsb2F0IHZhbHVlID0gMC4wO1xuICAgICAgICAgICAgZmxvYXQgc2NhbGUgPSAwLjU7XG4gICAgICAgIFxuICAgICAgICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCAxMDsgaSsrKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHZhbHVlICs9IG1ub2lzZShjb29yZHMpICogc2NhbGU7XG4gICAgICAgICAgICAgICAgY29vcmRzICo9IDQuMDtcbiAgICAgICAgICAgICAgICBzY2FsZSAqPSAwLjU7XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBcbiAgICAgICAgdm9pZCBtYWluSW1hZ2UoIG91dCB2ZWM0IGZyYWdDb2xvciwgaW4gdmVjMiBmcmFnQ29vcmQgKVxuICAgICAgICB7XG4gICAgICAgICAgICB2ZWMyIHV2ID0gZnJhZ0Nvb3JkLnh5IC8gaVJlc29sdXRpb24ueSAqIDIuMDtcbiAgICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgZmluYWwgPSAwLjA7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvciAoaW50IGkgPTE7IGkgPCA2OyBpKyspXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdmVjMiBtb3Rpb24gPSB2ZWMyKGZibSh1diArIHZlYzIoMC4wLGlUaW1lKSAqIDAuMDUgKyB2ZWMyKGksIDAuMCkpKTtcbiAgICAgICAgXG4gICAgICAgICAgICAgICAgZmluYWwgKz0gZmJtKHV2ICsgbW90aW9uKTtcbiAgICAgICAgXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZpbmFsIC89IDUuMDtcbiAgICAgICAgICAgIGZyYWdDb2xvciA9IHZlYzQobWl4KHZlYzMoLTAuMyksIHZlYzMoMC40NSwgMC40LCAwLjYpICsgdmVjMygwLjYpLCBmaW5hbCksIDEpO1xuICAgICAgICB9XG4gICAgYCxcbiAgICByZXBsYWNlTWFwOiBzaGFkZXJUb3lNYWluXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbihtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIGxldCBtYXQgPSAobWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsICYgRXh0cmFCaXRzKVxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleFJlcGVhdCA9IHsgdmFsdWU6IG1hdC5tYXAucmVwZWF0IH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcC5vZmZzZXQgfVxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4RmxpcFkgPSB7IHZhbHVlOiBtYXQubWFwLmZsaXBZID8gMCA6IDEgfVxuICAgICAgICBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlUaW1lLnZhbHVlID0gKHRpbWUgKiAwLjAwMTIpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgIH1cbn1cblxuXG5leHBvcnQgeyBNaXN0U2hhZGVyIH1cbiIsIi8vIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L1hkc0JEQlxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCBzdGF0ZSA9IHtcbiAgICBhbmltYXRlOiBmYWxzZSxcbiAgICBub2lzZU1vZGU6ICdzY2FsZScsXG4gICAgaW52ZXJ0OiBmYWxzZSxcbiAgICBzaGFycGVuOiB0cnVlLFxuICAgIHNjYWxlQnlQcmV2OiBmYWxzZSxcbiAgICBnYWluOiAwLjU0LFxuICAgIGxhY3VuYXJpdHk6IDIuMCxcbiAgICBvY3RhdmVzOiA1LFxuICAgIHNjYWxlMTogMy4wLFxuICAgIHNjYWxlMjogMy4wLFxuICAgIHRpbWVTY2FsZVg6IDAuNCxcbiAgICB0aW1lU2NhbGVZOiAwLjMsXG4gICAgY29sb3IxOiBbMCwgMCwgMF0sXG4gICAgY29sb3IyOiBbMTMwLCAxMjksMTI5XSxcbiAgICBjb2xvcjM6IFsxMTAsIDExMCwgMTEwXSxcbiAgICBjb2xvcjQ6IFs4MiwgNTEsIDEzXSxcbiAgICBvZmZzZXRBWDogMCxcbiAgICBvZmZzZXRBWTogMCxcbiAgICBvZmZzZXRCWDogMy43LFxuICAgIG9mZnNldEJZOiAwLjksXG4gICAgb2Zmc2V0Q1g6IDIuMSxcbiAgICBvZmZzZXRDWTogMy4yLFxuICAgIG9mZnNldERYOiA0LjMsXG4gICAgb2Zmc2V0RFk6IDIuOCxcbiAgICBvZmZzZXRYOiAwLFxuICAgIG9mZnNldFk6IDAsXG59O1xuXG5sZXQgTWFyYmxlMVNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB7XG4gICAgICAgIG1iX2FuaW1hdGU6IHsgdmFsdWU6IHN0YXRlLmFuaW1hdGUgfSxcbiAgICAgICAgbWJfY29sb3IxOiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjEubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfY29sb3IyOiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjIubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfY29sb3IzOiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjMubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfY29sb3I0OiB7IHZhbHVlOiBzdGF0ZS5jb2xvcjQubWFwKGMgPT4gYyAvIDI1NSkgfSxcbiAgICAgICAgbWJfZ2FpbjogeyB2YWx1ZTogc3RhdGUuZ2FpbiB9LFxuICAgICAgICBtYl9pbnZlcnQ6IHsgdmFsdWU6IHN0YXRlLmludmVydCB9LFxuICAgICAgICBtYl9sYWN1bmFyaXR5OiB7IHZhbHVlOiBzdGF0ZS5sYWN1bmFyaXR5IH0sXG4gICAgICAgIG1iX25vaXNlTW9kZTogeyB2YWx1ZTogc3RhdGUubm9pc2VNb2RlID09PSAnc2NhbGUnID8gMCA6IDEgfSxcbiAgICAgICAgbWJfb2N0YXZlczogeyB2YWx1ZTogc3RhdGUub2N0YXZlcyB9LFxuICAgICAgICBtYl9vZmZzZXQ6IHsgdmFsdWU6IFtzdGF0ZS5vZmZzZXRYLCBzdGF0ZS5vZmZzZXRZXSB9LFxuICAgICAgICBtYl9vZmZzZXRBOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0QVgsIHN0YXRlLm9mZnNldEFZXSB9LFxuICAgICAgICBtYl9vZmZzZXRCOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0QlgsIHN0YXRlLm9mZnNldEJZXSB9LFxuICAgICAgICBtYl9vZmZzZXRDOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0Q1gsIHN0YXRlLm9mZnNldENZXSB9LFxuICAgICAgICBtYl9vZmZzZXREOiB7IHZhbHVlOiBbc3RhdGUub2Zmc2V0RFgsIHN0YXRlLm9mZnNldERZXSB9LFxuICAgICAgICBtYl9zY2FsZTE6IHsgdmFsdWU6IHN0YXRlLnNjYWxlMSB9LFxuICAgICAgICBtYl9zY2FsZTI6IHsgdmFsdWU6IHN0YXRlLnNjYWxlMiB9LFxuICAgICAgICBtYl9zY2FsZUJ5UHJldjogeyB2YWx1ZTogc3RhdGUuc2NhbGVCeVByZXYgfSxcbiAgICAgICAgbWJfc2hhcnBlbjogeyB2YWx1ZTogc3RhdGUuc2hhcnBlbiB9LFxuICAgICAgICBtYl90aW1lOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIG1iX3RpbWVTY2FsZTogeyB2YWx1ZTogW3N0YXRlLnRpbWVTY2FsZVgsIHN0YXRlLnRpbWVTY2FsZVldIH0sXG4gICAgICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgICAgICB0ZXhPZmZzZXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDAsMCkgfSAgICBcbiAgICB9LFxuICAgIHZlcnRleFNoYWRlcjoge30sXG5cbiAgICBmcmFnbWVudFNoYWRlcjoge1xuICAgICAgICB1bmlmb3JtczogZ2xzbGBcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9hbmltYXRlO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMzIG1iX2NvbG9yMTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMyBtYl9jb2xvcjI7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzMgbWJfY29sb3IzO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMzIG1iX2NvbG9yNDtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgbWJfZ2FpbjtcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9pbnZlcnQ7XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX2xhY3VuYXJpdHk7XG4gICAgICAgICAgICB1bmlmb3JtIGludCBtYl9ub2lzZU1vZGU7XG4gICAgICAgICAgICB1bmlmb3JtIGludCBtYl9vY3RhdmVzO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldDtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXRBO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX29mZnNldEI7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgbWJfb2Zmc2V0QztcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiBtYl9vZmZzZXREO1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl9zY2FsZTE7XG4gICAgICAgICAgICB1bmlmb3JtIGZsb2F0IG1iX3NjYWxlMjtcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9zY2FsZUJ5UHJldjtcbiAgICAgICAgICAgIHVuaWZvcm0gYm9vbCBtYl9zaGFycGVuO1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBtYl90aW1lO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIG1iX3RpbWVTY2FsZTtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhSZXBlYXQ7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgdGV4T2Zmc2V0O1xuICAgICAgICAgICAgICAgICAgICBgLFxuICAgICAgICBmdW5jdGlvbnM6IGdsc2xgXG4gICAgICAgIC8vIFNvbWUgdXNlZnVsIGZ1bmN0aW9uc1xuICAgICAgICB2ZWMzIG1iX21vZDI4OSh2ZWMzIHgpIHsgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDsgfVxuICAgICAgICB2ZWMyIG1iX21vZDI4OSh2ZWMyIHgpIHsgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDsgfVxuICAgICAgICB2ZWMzIG1iX3Blcm11dGUodmVjMyB4KSB7IHJldHVybiBtYl9tb2QyODkoKCh4KjM0LjApKzEuMCkqeCk7IH1cbiAgICAgICAgXG4gICAgICAgIC8vXG4gICAgICAgIC8vIERlc2NyaXB0aW9uIDogR0xTTCAyRCBzaW1wbGV4IG5vaXNlIGZ1bmN0aW9uXG4gICAgICAgIC8vICAgICAgQXV0aG9yIDogSWFuIE1jRXdhbiwgQXNoaW1hIEFydHNcbiAgICAgICAgLy8gIE1haW50YWluZXIgOiBpam1cbiAgICAgICAgLy8gICAgIExhc3Rtb2QgOiAyMDExMDgyMiAoaWptKVxuICAgICAgICAvLyAgICAgTGljZW5zZSA6XG4gICAgICAgIC8vICBDb3B5cmlnaHQgKEMpIDIwMTEgQXNoaW1hIEFydHMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gICAgICAgIC8vICBEaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMSUNFTlNFIGZpbGUuXG4gICAgICAgIC8vICBodHRwczovL2dpdGh1Yi5jb20vYXNoaW1hL3dlYmdsLW5vaXNlXG4gICAgICAgIC8vXG4gICAgICAgIGZsb2F0IG1iX3Nub2lzZSh2ZWMyIHYpIHtcbiAgICAgICAgICAgIC8vIFByZWNvbXB1dGUgdmFsdWVzIGZvciBza2V3ZWQgdHJpYW5ndWxhciBncmlkXG4gICAgICAgICAgICBjb25zdCB2ZWM0IEMgPSB2ZWM0KDAuMjExMzI0ODY1NDA1MTg3LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAoMy4wLXNxcnQoMy4wKSkvNi4wXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAuMzY2MDI1NDAzNzg0NDM5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAwLjUqKHNxcnQoMy4wKS0xLjApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0wLjU3NzM1MDI2OTE4OTYyNixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gLTEuMCArIDIuMCAqIEMueFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwLjAyNDM5MDI0MzkwMjQzOSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDEuMCAvIDQxLjBcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBGaXJzdCBjb3JuZXIgKHgwKVxuICAgICAgICAgICAgdmVjMiBpICA9IGZsb29yKHYgKyBkb3QodiwgQy55eSkpO1xuICAgICAgICAgICAgdmVjMiB4MCA9IHYgLSBpICsgZG90KGksIEMueHgpO1xuICAgICAgICBcbiAgICAgICAgICAgIC8vIE90aGVyIHR3byBjb3JuZXJzICh4MSwgeDIpXG4gICAgICAgICAgICB2ZWMyIGkxID0gdmVjMigwLjApO1xuICAgICAgICAgICAgaTEgPSAoeDAueCA+IHgwLnkpPyB2ZWMyKDEuMCwgMC4wKTp2ZWMyKDAuMCwgMS4wKTtcbiAgICAgICAgICAgIHZlYzIgeDEgPSB4MC54eSArIEMueHggLSBpMTtcbiAgICAgICAgICAgIHZlYzIgeDIgPSB4MC54eSArIEMueno7XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gRG8gc29tZSBwZXJtdXRhdGlvbnMgdG8gYXZvaWRcbiAgICAgICAgICAgIC8vIHRydW5jYXRpb24gZWZmZWN0cyBpbiBwZXJtdXRhdGlvblxuICAgICAgICAgICAgaSA9IG1iX21vZDI4OShpKTtcbiAgICAgICAgICAgIHZlYzMgcCA9IG1iX3Blcm11dGUoXG4gICAgICAgICAgICAgICAgICAgIG1iX3Blcm11dGUoIGkueSArIHZlYzMoMC4wLCBpMS55LCAxLjApKVxuICAgICAgICAgICAgICAgICAgICAgICAgKyBpLnggKyB2ZWMzKDAuMCwgaTEueCwgMS4wICkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHZlYzMgbSA9IG1heCgwLjUgLSB2ZWMzKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QoeDAseDApLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QoeDEseDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb3QoeDIseDIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICksIDAuMCk7XG4gICAgICAgIFxuICAgICAgICAgICAgbSA9IG0qbTtcbiAgICAgICAgICAgIG0gPSBtKm07XG4gICAgICAgIFxuICAgICAgICAgICAgLy8gR3JhZGllbnRzOlxuICAgICAgICAgICAgLy8gIDQxIHB0cyB1bmlmb3JtbHkgb3ZlciBhIGxpbmUsIG1hcHBlZCBvbnRvIGEgZGlhbW9uZFxuICAgICAgICAgICAgLy8gIFRoZSByaW5nIHNpemUgMTcqMTcgPSAyODkgaXMgY2xvc2UgdG8gYSBtdWx0aXBsZVxuICAgICAgICAgICAgLy8gICAgICBvZiA0MSAoNDEqNyA9IDI4NylcbiAgICAgICAgXG4gICAgICAgICAgICB2ZWMzIHggPSAyLjAgKiBmcmFjdChwICogQy53d3cpIC0gMS4wO1xuICAgICAgICAgICAgdmVjMyBoID0gYWJzKHgpIC0gMC41O1xuICAgICAgICAgICAgdmVjMyBveCA9IGZsb29yKHggKyAwLjUpO1xuICAgICAgICAgICAgdmVjMyBhMCA9IHggLSBveDtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBOb3JtYWxpc2UgZ3JhZGllbnRzIGltcGxpY2l0bHkgYnkgc2NhbGluZyBtXG4gICAgICAgICAgICAvLyBBcHByb3hpbWF0aW9uIG9mOiBtICo9IGludmVyc2VzcXJ0KGEwKmEwICsgaCpoKTtcbiAgICAgICAgICAgIG0gKj0gMS43OTI4NDI5MTQwMDE1OSAtIDAuODUzNzM0NzIwOTUzMTQgKiAoYTAqYTAraCpoKTtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBDb21wdXRlIGZpbmFsIG5vaXNlIHZhbHVlIGF0IFBcbiAgICAgICAgICAgIHZlYzMgZyA9IHZlYzMoMC4wKTtcbiAgICAgICAgICAgIGcueCAgPSBhMC54ICAqIHgwLnggICsgaC54ICAqIHgwLnk7XG4gICAgICAgICAgICBnLnl6ID0gYTAueXogKiB2ZWMyKHgxLngseDIueCkgKyBoLnl6ICogdmVjMih4MS55LHgyLnkpO1xuICAgICAgICAgICAgcmV0dXJuIDEzMC4wICogZG90KG0sIGcpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmbG9hdCBtYl9nZXROb2lzZVZhbCh2ZWMyIHApIHtcbiAgICAgICAgICAgIGZsb2F0IHJhdyA9IG1iX3Nub2lzZShwKTtcbiAgICAgICAgXG4gICAgICAgICAgICBpZiAobWJfbm9pc2VNb2RlID09IDEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWJzKHJhdyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHJhdyAqIDAuNSArIDAuNTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbWJfZmJtKHZlYzIgcCkge1xuICAgICAgICAgICAgZmxvYXQgc3VtID0gMC4wO1xuICAgICAgICAgICAgZmxvYXQgZnJlcSA9IDEuMDtcbiAgICAgICAgICAgIGZsb2F0IGFtcCA9IDAuNTtcbiAgICAgICAgICAgIGZsb2F0IHByZXYgPSAxLjA7XG4gICAgICAgIFxuICAgICAgICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCBtYl9vY3RhdmVzOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmbG9hdCBuID0gbWJfZ2V0Tm9pc2VWYWwocCAqIGZyZXEpO1xuICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAobWJfaW52ZXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIG4gPSAxLjAgLSBuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1iX3NoYXJwZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgbiA9IG4gKiBuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgICAgICAgICAgc3VtICs9IG4gKiBhbXA7XG4gICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChtYl9zY2FsZUJ5UHJldikge1xuICAgICAgICAgICAgICAgICAgICBzdW0gKz0gbiAqIGFtcCAqIHByZXY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgICAgICBwcmV2ID0gbjtcbiAgICAgICAgICAgICAgICBmcmVxICo9IG1iX2xhY3VuYXJpdHk7XG4gICAgICAgICAgICAgICAgYW1wICo9IG1iX2dhaW47XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIHN1bTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZmxvYXQgbWJfcGF0dGVybihpbiB2ZWMyIHAsIG91dCB2ZWMyIHEsIG91dCB2ZWMyIHIpIHtcbiAgICAgICAgICAgIHAgKj0gbWJfc2NhbGUxO1xuICAgICAgICAgICAgcCArPSBtYl9vZmZzZXQ7XG4gICAgICAgIFxuICAgICAgICAgICAgZmxvYXQgdCA9IDAuMDtcbiAgICAgICAgICAgIGlmIChtYl9hbmltYXRlKSB7XG4gICAgICAgICAgICAgICAgdCA9IG1iX3RpbWUgKiAwLjE7XG4gICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgcSA9IHZlYzIobWJfZmJtKHAgKyBtYl9vZmZzZXRBICsgdCAqIG1iX3RpbWVTY2FsZS54KSwgbWJfZmJtKHAgKyBtYl9vZmZzZXRCIC0gdCAqIG1iX3RpbWVTY2FsZS55KSk7XG4gICAgICAgICAgICByID0gdmVjMihtYl9mYm0ocCArIG1iX3NjYWxlMiAqIHEgKyBtYl9vZmZzZXRDKSwgbWJfZmJtKHAgKyBtYl9zY2FsZTIgKiBxICsgbWJfb2Zmc2V0RCkpO1xuICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiBtYl9mYm0ocCArIG1iX3NjYWxlMiAqIHIpO1xuICAgICAgICB9XG4gICAgYCxcbiAgICByZXBsYWNlTWFwOiBnbHNsYFxuICAgICAgICB2ZWMzIG1hcmJsZUNvbG9yID0gdmVjMygwLjApO1xuXG4gICAgICAgIHZlYzIgcTtcbiAgICAgICAgdmVjMiByO1xuXG4gICAgICAgIHZlYzIgdXYgPSBtb2QodlV2Lnh5LCB2ZWMyKDEuMCwxLjApKTsgXG4gICAgICAgIGlmICh1di54IDwgMC4wKSB7IHV2LnggPSB1di54ICsgMS4wO31cbiAgICAgICAgaWYgKHV2LnkgPCAwLjApIHsgdXYueSA9IHV2LnkgKyAxLjA7fVxuICAgICAgICB1di54ID0gY2xhbXAodXYueCwgMC4wLCAxLjApO1xuICAgICAgICB1di55ID0gY2xhbXAodXYueSwgMC4wLCAxLjApO1xuXG4gICAgICAgIGZsb2F0IGYgPSBtYl9wYXR0ZXJuKHV2LCBxLCByKTtcbiAgICAgICAgXG4gICAgICAgIG1hcmJsZUNvbG9yID0gbWl4KG1iX2NvbG9yMSwgbWJfY29sb3IyLCBmKTtcbiAgICAgICAgbWFyYmxlQ29sb3IgPSBtaXgobWFyYmxlQ29sb3IsIG1iX2NvbG9yMywgbGVuZ3RoKHEpIC8gMi4wKTtcbiAgICAgICAgbWFyYmxlQ29sb3IgPSBtaXgobWFyYmxlQ29sb3IsIG1iX2NvbG9yNCwgci55IC8gMi4wKTtcblxuICAgICAgICB2ZWM0IG1hcmJsZUNvbG9yNCA9IG1hcFRleGVsVG9MaW5lYXIoIHZlYzQobWFyYmxlQ29sb3IsMS4wKSApO1xuXG4gICAgICAgIGRpZmZ1c2VDb2xvciAqPSBtYXJibGVDb2xvcjQ7XG4gICAgYFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cblxuICAgICAgICAvLyB3ZSBzZWVtIHRvIHdhbnQgdG8gZmxpcCB0aGUgZmxpcFlcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMubWJfaW52ZXJ0ID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IHN0YXRlLmludmVydCA6ICFzdGF0ZS5pbnZlcnQgfVxuXG4gICAgICAgIC8vIGxldHMgYWRkIGEgYml0IG9mIHJhbmRvbW5lc3MgdG8gdGhlIGlucHV0IHNvIG11bHRpcGxlIGluc3RhbmNlcyBhcmUgZGlmZmVyZW50XG4gICAgICAgIGxldCByeCA9IE1hdGgucmFuZG9tKClcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMubWJfb2Zmc2V0QSA9IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKCBzdGF0ZS5vZmZzZXRBWCArIE1hdGgucmFuZG9tKCksIHN0YXRlLm9mZnNldEFZICsgTWF0aC5yYW5kb20oKSkgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5tYl9vZmZzZXRCID0geyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoIHN0YXRlLm9mZnNldEJYICsgTWF0aC5yYW5kb20oKSwgc3RhdGUub2Zmc2V0QlkgKyBNYXRoLnJhbmRvbSgpKSB9XG4gICAgfSxcbiAgICB1cGRhdGVVbmlmb3JtczogZnVuY3Rpb24odGltZTogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwgJiBFeHRlbmRlZE1hdGVyaWFsKSB7XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLm1iX3RpbWUudmFsdWUgPSB0aW1lICogMC4wMDFcbiAgICB9XG59XG5cbmV4cG9ydCB7IE1hcmJsZTFTaGFkZXIgfVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3dpbGxpYW1jYXNleWx1Y2FzLmdpdGh1Yi5pby9jb3JlLWNvbXBvbmVudHMvMWVjOTY1YzVkNmRmNTc3Yy5qcGdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3d3dy5zaGFkZXJ0b3kuY29tL3ZpZXcvNHQzM3o4XG5pbXBvcnQgc2hhZGVyVG95TWFpbiBmcm9tIFwiLi9zaGFkZXJUb3lNYWluXCJcbmltcG9ydCBzaGFkZXJUb3lVbmlmb3JtT2JqIGZyb20gXCIuL3NoYWRlclRveVVuaWZvcm1PYmpcIlxuaW1wb3J0IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgZnJvbSBcIi4vc2hhZGVyVG95VW5pZm9ybV9wYXJhc1wiXG5pbXBvcnQgc21hbGxOb2lzZSBmcm9tICcuLi9hc3NldHMvc21hbGwtbm9pc2UucG5nJ1xuaW1wb3J0IG5vdEZvdW5kIGZyb20gJy4uL2Fzc2V0cy9iYWRTaGFkZXIuanBnJ1xuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5cbmNvbnN0IGdsc2wgPSBTdHJpbmcucmF3XG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCB1bmlmb3JtcyA9IE9iamVjdC5hc3NpZ24oe30sIHNoYWRlclRveVVuaWZvcm1PYmosIHtcbiAgICBpQ2hhbm5lbDA6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBpQ2hhbm5lbDE6IHsgdmFsdWU6IG51bGwgfVxufSlcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIG5vaXNlVGV4OiBUSFJFRS5UZXh0dXJlXG5sb2FkZXIubG9hZChzbWFsbE5vaXNlLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vaXNlVGV4ID0gbm9pc2Vcbn0pXG52YXIgbm90Rm91bmRUZXg6IFRIUkVFLlRleHR1cmVcbmxvYWRlci5sb2FkKG5vdEZvdW5kLCAobm9pc2UpID0+IHtcbiAgICBub2lzZS5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIG5vaXNlLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgbm9pc2Uud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub2lzZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIG5vdEZvdW5kVGV4ID0gbm9pc2Vcbn0pXG5cbmxldCBOb3RGb3VuZFNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uID0ge1xuICAgIHVuaWZvcm1zOiB1bmlmb3JtcyxcbiAgICB2ZXJ0ZXhTaGFkZXI6IHt9LFxuXG4gICAgZnJhZ21lbnRTaGFkZXI6IHtcbiAgICAgICAgdW5pZm9ybXM6IHNoYWRlclRveVVuaWZvcm1fcGFyYXMgKyBnbHNsYFxuICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCBpQ2hhbm5lbDA7XG4gICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIGlDaGFubmVsMTtcbiAgICAgICAgYCxcbiAgICAgICAgZnVuY3Rpb25zOiBnbHNsYFxuICAgICAgICB2b2lkIG1haW5JbWFnZSggb3V0IHZlYzQgZnJhZ0NvbG9yLCBpbiB2ZWMyIGZyYWdDb29yZCApXG4gICAgICAgIHtcbiAgICAgICAgICAgIHZlYzIgdXYgPSBmcmFnQ29vcmQueHkgLyBpUmVzb2x1dGlvbi54eTtcbiAgICAgICAgICAgIHZlYzIgd2FycFVWID0gMi4gKiB1djtcbiAgICAgICAgXG4gICAgICAgICAgICBmbG9hdCBkID0gbGVuZ3RoKCB3YXJwVVYgKTtcbiAgICAgICAgICAgIHZlYzIgc3QgPSB3YXJwVVYqMC4xICsgMC4yKnZlYzIoY29zKDAuMDcxKmlUaW1lKjIuK2QpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbigwLjA3MyppVGltZSoyLi1kKSk7XG4gICAgICAgIFxuICAgICAgICAgICAgdmVjMyB3YXJwZWRDb2wgPSB0ZXh0dXJlKCBpQ2hhbm5lbDAsIHN0ICkueHl6ICogMi4wO1xuICAgICAgICAgICAgZmxvYXQgdyA9IG1heCggd2FycGVkQ29sLnIsIDAuODUpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB2ZWMyIG9mZnNldCA9IDAuMDEgKiBjb3MoIHdhcnBlZENvbC5yZyAqIDMuMTQxNTkgKTtcbiAgICAgICAgICAgIHZlYzMgY29sID0gdGV4dHVyZSggaUNoYW5uZWwxLCB1diArIG9mZnNldCApLnJnYiAqIHZlYzMoMC44LCAwLjgsIDEuNSkgO1xuICAgICAgICAgICAgY29sICo9IHcqMS4yO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmcmFnQ29sb3IgPSB2ZWM0KCBtaXgoY29sLCB0ZXh0dXJlKCBpQ2hhbm5lbDEsIHV2ICsgb2Zmc2V0ICkucmdiLCAwLjUpLCAgMS4wKTtcbiAgICAgICAgfVxuICAgICAgICBgLFxuICAgIHJlcGxhY2VNYXA6IHNoYWRlclRveU1haW5cbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbGV0IG1hdCA9IChtYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwgJiBFeHRyYUJpdHMpXG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4UmVwZWF0ID0geyB2YWx1ZTogbWF0Lm1hcC5yZXBlYXQgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhPZmZzZXQgPSB7IHZhbHVlOiBtYXQubWFwLm9mZnNldCB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAuZmxpcFkgPyAwIDogMSB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMC52YWx1ZSA9IG5vaXNlVGV4XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLmlDaGFubmVsMS52YWx1ZSA9IG5vdEZvdW5kVGV4XG4gICAgICAgIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXQgPSAoTWF0aC5yYW5kb20oKSArIDAuNSkgKiAxMDAwMFxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pVGltZS52YWx1ZSA9ICh0aW1lICogMC4wMDEpICsgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDAudmFsdWUgPSBub2lzZVRleFxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5pQ2hhbm5lbDEudmFsdWUgPSBub3RGb3VuZFRleFxuICAgIH1cbn1cblxuZXhwb3J0IHsgTm90Rm91bmRTaGFkZXIgfVxuIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3dpbGxpYW1jYXNleWx1Y2FzLmdpdGh1Yi5pby9jb3JlLWNvbXBvbmVudHMvNDgxYTkyYjQ0ZTU2ZGFkNC5wbmdcIiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5pbXBvcnQgd2FycGZ4IGZyb20gJy4uL2Fzc2V0cy93YXJwZngucG5nJ1xuXG5jb25zdCBnbHNsID0gU3RyaW5nLnJhd1xuXG5jb25zdCB1bmlmb3JtcyA9IHtcbiAgICB3YXJwVGltZToge3ZhbHVlOiAwfSxcbiAgICB3YXJwVGV4OiB7dmFsdWU6IG51bGx9LFxuICAgIHRleFJlcGVhdDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9LFxuICAgIHRleE9mZnNldDogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9LFxuICAgIHRleEZsaXBZOiB7IHZhbHVlOiAwIH1cbn0gXG5cbmludGVyZmFjZSBFeHRyYUJpdHMge1xuICAgIG1hcDogVEhSRUUuVGV4dHVyZVxufVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgd2FycFRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQod2FycGZ4LCAod2FycCkgPT4ge1xuICAgIHdhcnAubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICB3YXJwLm1hZ0ZpbHRlciA9IFRIUkVFLk5lYXJlc3RGaWx0ZXI7XG4gICAgd2FycC53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIHdhcnAud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICB3YXJwVGV4ID0gd2FycFxufSlcblxubGV0IFdhcnBTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7fSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIHVuaWZvcm1zOiBnbHNsYFxuICAgICAgICB1bmlmb3JtIGZsb2F0IHdhcnBUaW1lO1xuICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCB3YXJwVGV4O1xuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4UmVwZWF0O1xuICAgICAgICB1bmlmb3JtIHZlYzIgdGV4T2Zmc2V0O1xuICAgICAgICB1bmlmb3JtIGludCB0ZXhGbGlwWTsgXG4gICAgICAgICAgICAgICAgYCxcbiAgICAgICAgcmVwbGFjZU1hcDogZ2xzbGBcbiAgICAgICAgICBmbG9hdCB0ID0gd2FycFRpbWU7XG5cbiAgICAgICAgICB2ZWMyIHV2ID0gbW9kKHZVdi54eSwgdmVjMigxLjAsMS4wKSk7IC8vbW9kKHZVdi54eSAqIHRleFJlcGVhdC54eSArIHRleE9mZnNldC54eSwgdmVjMigxLjAsMS4wKSk7XG5cbiAgICAgICAgICBpZiAodXYueCA8IDAuMCkgeyB1di54ID0gdXYueCArIDEuMDt9XG4gICAgICAgICAgaWYgKHV2LnkgPCAwLjApIHsgdXYueSA9IHV2LnkgKyAxLjA7fVxuICAgICAgICAgIGlmICh0ZXhGbGlwWSA+IDApIHsgdXYueSA9IDEuMCAtIHV2Lnk7fVxuICAgICAgICAgIHV2LnggPSBjbGFtcCh1di54LCAwLjAsIDEuMCk7XG4gICAgICAgICAgdXYueSA9IGNsYW1wKHV2LnksIDAuMCwgMS4wKTtcbiAgXG4gICAgICAgICAgdmVjMiBzY2FsZWRVViA9IHV2ICogMi4wIC0gMS4wO1xuICAgICAgICAgIHZlYzIgcHV2ID0gdmVjMihsZW5ndGgoc2NhbGVkVVYueHkpLCBhdGFuKHNjYWxlZFVWLngsIHNjYWxlZFVWLnkpKTtcbiAgICAgICAgICB2ZWM0IGNvbCA9IHRleHR1cmUyRCh3YXJwVGV4LCB2ZWMyKGxvZyhwdXYueCkgKyB0IC8gNS4wLCBwdXYueSAvIDMuMTQxNTkyNiApKTtcbiAgICAgICAgICBmbG9hdCBnbG93ID0gKDEuMCAtIHB1di54KSAqICgwLjUgKyAoc2luKHQpICsgMi4wICkgLyA0LjApO1xuICAgICAgICAgIC8vIGJsdWUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDExOC4wLzI1NS4wLCAxNDQuMC8yNTUuMCwgMjE5LjAvMjU1LjAsIDEuMCkgKiAoMC40ICsgZ2xvdyAqIDEuMCk7XG4gICAgICAgICAgLy8gd2hpdGUgZ2xvd1xuICAgICAgICAgIGNvbCArPSB2ZWM0KDAuMikgKiBzbW9vdGhzdGVwKDAuMCwgMi4wLCBnbG93ICogZ2xvdyk7XG4gICAgICAgICAgXG4gICAgICAgICAgY29sID0gbWFwVGV4ZWxUb0xpbmVhciggY29sICk7XG4gICAgICAgICAgZGlmZnVzZUNvbG9yICo9IGNvbDtcbiAgICAgICAgYFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwLnJlcGVhdCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleE9mZnNldCA9IHsgdmFsdWU6IG1hdC5tYXAub2Zmc2V0IH1cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnRleEZsaXBZID0geyB2YWx1ZTogbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpKzAuNSkgKiAxMFxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUZXgudmFsdWUgPSB3YXJwVGV4XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZSA9IHsgdmFsdWU6IDAgfVxuICAgIH0sXG4gICAgdXBkYXRlVW5pZm9ybXM6IGZ1bmN0aW9uKHRpbWU6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy53YXJwVGltZS52YWx1ZSA9IHRpbWUgKiAwLjAwMSArIG1hdGVyaWFsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRleC52YWx1ZSA9IHdhcnBUZXhcbiAgICB9XG59XG5cblxuZXhwb3J0IHsgV2FycFNoYWRlciB9XG4iLCIvKlxuICogM0QgU2ltcGxleCBub2lzZVxuICogU0lHTkFUVVJFOiBmbG9hdCBzbm9pc2UodmVjMyB2KVxuICogaHR0cHM6Ly9naXRodWIuY29tL2h1Z2hzay9nbHNsLW5vaXNlXG4gKi9cblxuY29uc3QgZ2xzbCA9IGBcbi8vXG4vLyBEZXNjcmlwdGlvbiA6IEFycmF5IGFuZCB0ZXh0dXJlbGVzcyBHTFNMIDJELzNELzREIHNpbXBsZXhcbi8vICAgICAgICAgICAgICAgbm9pc2UgZnVuY3Rpb25zLlxuLy8gICAgICBBdXRob3IgOiBJYW4gTWNFd2FuLCBBc2hpbWEgQXJ0cy5cbi8vICBNYWludGFpbmVyIDogaWptXG4vLyAgICAgTGFzdG1vZCA6IDIwMTEwODIyIChpam0pXG4vLyAgICAgTGljZW5zZSA6IENvcHlyaWdodCAoQykgMjAxMSBBc2hpbWEgQXJ0cy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbi8vICAgICAgICAgICAgICAgRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTElDRU5TRSBmaWxlLlxuLy8gICAgICAgICAgICAgICBodHRwczovL2dpdGh1Yi5jb20vYXNoaW1hL3dlYmdsLW5vaXNlXG4vL1xuXG52ZWMzIG1vZDI4OSh2ZWMzIHgpIHtcbiAgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDtcbn1cblxudmVjNCBtb2QyODkodmVjNCB4KSB7XG4gIHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7XG59XG5cbnZlYzQgcGVybXV0ZSh2ZWM0IHgpIHtcbiAgICAgcmV0dXJuIG1vZDI4OSgoKHgqMzQuMCkrMS4wKSp4KTtcbn1cblxudmVjNCB0YXlsb3JJbnZTcXJ0KHZlYzQgcilcbntcbiAgcmV0dXJuIDEuNzkyODQyOTE0MDAxNTkgLSAwLjg1MzczNDcyMDk1MzE0ICogcjtcbn1cblxuZmxvYXQgc25vaXNlKHZlYzMgdilcbiAge1xuICBjb25zdCB2ZWMyICBDID0gdmVjMigxLjAvNi4wLCAxLjAvMy4wKSA7XG4gIGNvbnN0IHZlYzQgIEQgPSB2ZWM0KDAuMCwgMC41LCAxLjAsIDIuMCk7XG5cbi8vIEZpcnN0IGNvcm5lclxuICB2ZWMzIGkgID0gZmxvb3IodiArIGRvdCh2LCBDLnl5eSkgKTtcbiAgdmVjMyB4MCA9ICAgdiAtIGkgKyBkb3QoaSwgQy54eHgpIDtcblxuLy8gT3RoZXIgY29ybmVyc1xuICB2ZWMzIGcgPSBzdGVwKHgwLnl6eCwgeDAueHl6KTtcbiAgdmVjMyBsID0gMS4wIC0gZztcbiAgdmVjMyBpMSA9IG1pbiggZy54eXosIGwuenh5ICk7XG4gIHZlYzMgaTIgPSBtYXgoIGcueHl6LCBsLnp4eSApO1xuXG4gIC8vICAgeDAgPSB4MCAtIDAuMCArIDAuMCAqIEMueHh4O1xuICAvLyAgIHgxID0geDAgLSBpMSAgKyAxLjAgKiBDLnh4eDtcbiAgLy8gICB4MiA9IHgwIC0gaTIgICsgMi4wICogQy54eHg7XG4gIC8vICAgeDMgPSB4MCAtIDEuMCArIDMuMCAqIEMueHh4O1xuICB2ZWMzIHgxID0geDAgLSBpMSArIEMueHh4O1xuICB2ZWMzIHgyID0geDAgLSBpMiArIEMueXl5OyAvLyAyLjAqQy54ID0gMS8zID0gQy55XG4gIHZlYzMgeDMgPSB4MCAtIEQueXl5OyAgICAgIC8vIC0xLjArMy4wKkMueCA9IC0wLjUgPSAtRC55XG5cbi8vIFBlcm11dGF0aW9uc1xuICBpID0gbW9kMjg5KGkpO1xuICB2ZWM0IHAgPSBwZXJtdXRlKCBwZXJtdXRlKCBwZXJtdXRlKFxuICAgICAgICAgICAgIGkueiArIHZlYzQoMC4wLCBpMS56LCBpMi56LCAxLjAgKSlcbiAgICAgICAgICAgKyBpLnkgKyB2ZWM0KDAuMCwgaTEueSwgaTIueSwgMS4wICkpXG4gICAgICAgICAgICsgaS54ICsgdmVjNCgwLjAsIGkxLngsIGkyLngsIDEuMCApKTtcblxuLy8gR3JhZGllbnRzOiA3eDcgcG9pbnRzIG92ZXIgYSBzcXVhcmUsIG1hcHBlZCBvbnRvIGFuIG9jdGFoZWRyb24uXG4vLyBUaGUgcmluZyBzaXplIDE3KjE3ID0gMjg5IGlzIGNsb3NlIHRvIGEgbXVsdGlwbGUgb2YgNDkgKDQ5KjYgPSAyOTQpXG4gIGZsb2F0IG5fID0gMC4xNDI4NTcxNDI4NTc7IC8vIDEuMC83LjBcbiAgdmVjMyAgbnMgPSBuXyAqIEQud3l6IC0gRC54eng7XG5cbiAgdmVjNCBqID0gcCAtIDQ5LjAgKiBmbG9vcihwICogbnMueiAqIG5zLnopOyAgLy8gIG1vZChwLDcqNylcblxuICB2ZWM0IHhfID0gZmxvb3IoaiAqIG5zLnopO1xuICB2ZWM0IHlfID0gZmxvb3IoaiAtIDcuMCAqIHhfICk7ICAgIC8vIG1vZChqLE4pXG5cbiAgdmVjNCB4ID0geF8gKm5zLnggKyBucy55eXl5O1xuICB2ZWM0IHkgPSB5XyAqbnMueCArIG5zLnl5eXk7XG4gIHZlYzQgaCA9IDEuMCAtIGFicyh4KSAtIGFicyh5KTtcblxuICB2ZWM0IGIwID0gdmVjNCggeC54eSwgeS54eSApO1xuICB2ZWM0IGIxID0gdmVjNCggeC56dywgeS56dyApO1xuXG4gIC8vdmVjNCBzMCA9IHZlYzQobGVzc1RoYW4oYjAsMC4wKSkqMi4wIC0gMS4wO1xuICAvL3ZlYzQgczEgPSB2ZWM0KGxlc3NUaGFuKGIxLDAuMCkpKjIuMCAtIDEuMDtcbiAgdmVjNCBzMCA9IGZsb29yKGIwKSoyLjAgKyAxLjA7XG4gIHZlYzQgczEgPSBmbG9vcihiMSkqMi4wICsgMS4wO1xuICB2ZWM0IHNoID0gLXN0ZXAoaCwgdmVjNCgwLjApKTtcblxuICB2ZWM0IGEwID0gYjAueHp5dyArIHMwLnh6eXcqc2gueHh5eSA7XG4gIHZlYzQgYTEgPSBiMS54enl3ICsgczEueHp5dypzaC56end3IDtcblxuICB2ZWMzIHAwID0gdmVjMyhhMC54eSxoLngpO1xuICB2ZWMzIHAxID0gdmVjMyhhMC56dyxoLnkpO1xuICB2ZWMzIHAyID0gdmVjMyhhMS54eSxoLnopO1xuICB2ZWMzIHAzID0gdmVjMyhhMS56dyxoLncpO1xuXG4vL05vcm1hbGlzZSBncmFkaWVudHNcbiAgdmVjNCBub3JtID0gdGF5bG9ySW52U3FydCh2ZWM0KGRvdChwMCxwMCksIGRvdChwMSxwMSksIGRvdChwMiwgcDIpLCBkb3QocDMscDMpKSk7XG4gIHAwICo9IG5vcm0ueDtcbiAgcDEgKj0gbm9ybS55O1xuICBwMiAqPSBub3JtLno7XG4gIHAzICo9IG5vcm0udztcblxuLy8gTWl4IGZpbmFsIG5vaXNlIHZhbHVlXG4gIHZlYzQgbSA9IG1heCgwLjYgLSB2ZWM0KGRvdCh4MCx4MCksIGRvdCh4MSx4MSksIGRvdCh4Mix4MiksIGRvdCh4Myx4MykpLCAwLjApO1xuICBtID0gbSAqIG07XG4gIHJldHVybiA0Mi4wICogZG90KCBtKm0sIHZlYzQoIGRvdChwMCx4MCksIGRvdChwMSx4MSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvdChwMix4MiksIGRvdChwMyx4MykgKSApO1xuICB9ICBcbmBcbmV4cG9ydCBkZWZhdWx0IGdsc2xcbiIsImNvbnN0IGdsc2wgPSBgXG5cbm1hdDQgaW52ZXJzZU1hdChtYXQ0IG0pIHtcbiAgZmxvYXRcbiAgICAgIGEwMCA9IG1bMF1bMF0sIGEwMSA9IG1bMF1bMV0sIGEwMiA9IG1bMF1bMl0sIGEwMyA9IG1bMF1bM10sXG4gICAgICBhMTAgPSBtWzFdWzBdLCBhMTEgPSBtWzFdWzFdLCBhMTIgPSBtWzFdWzJdLCBhMTMgPSBtWzFdWzNdLFxuICAgICAgYTIwID0gbVsyXVswXSwgYTIxID0gbVsyXVsxXSwgYTIyID0gbVsyXVsyXSwgYTIzID0gbVsyXVszXSxcbiAgICAgIGEzMCA9IG1bM11bMF0sIGEzMSA9IG1bM11bMV0sIGEzMiA9IG1bM11bMl0sIGEzMyA9IG1bM11bM10sXG5cbiAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgIGIwMSA9IGEwMCAqIGExMiAtIGEwMiAqIGExMCxcbiAgICAgIGIwMiA9IGEwMCAqIGExMyAtIGEwMyAqIGExMCxcbiAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgIGIwNCA9IGEwMSAqIGExMyAtIGEwMyAqIGExMSxcbiAgICAgIGIwNSA9IGEwMiAqIGExMyAtIGEwMyAqIGExMixcbiAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgIGIwNyA9IGEyMCAqIGEzMiAtIGEyMiAqIGEzMCxcbiAgICAgIGIwOCA9IGEyMCAqIGEzMyAtIGEyMyAqIGEzMCxcbiAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgIGIxMCA9IGEyMSAqIGEzMyAtIGEyMyAqIGEzMSxcbiAgICAgIGIxMSA9IGEyMiAqIGEzMyAtIGEyMyAqIGEzMixcblxuICAgICAgZGV0ID0gYjAwICogYjExIC0gYjAxICogYjEwICsgYjAyICogYjA5ICsgYjAzICogYjA4IC0gYjA0ICogYjA3ICsgYjA1ICogYjA2O1xuXG4gIHJldHVybiBtYXQ0KFxuICAgICAgYTExICogYjExIC0gYTEyICogYjEwICsgYTEzICogYjA5LFxuICAgICAgYTAyICogYjEwIC0gYTAxICogYjExIC0gYTAzICogYjA5LFxuICAgICAgYTMxICogYjA1IC0gYTMyICogYjA0ICsgYTMzICogYjAzLFxuICAgICAgYTIyICogYjA0IC0gYTIxICogYjA1IC0gYTIzICogYjAzLFxuICAgICAgYTEyICogYjA4IC0gYTEwICogYjExIC0gYTEzICogYjA3LFxuICAgICAgYTAwICogYjExIC0gYTAyICogYjA4ICsgYTAzICogYjA3LFxuICAgICAgYTMyICogYjAyIC0gYTMwICogYjA1IC0gYTMzICogYjAxLFxuICAgICAgYTIwICogYjA1IC0gYTIyICogYjAyICsgYTIzICogYjAxLFxuICAgICAgYTEwICogYjEwIC0gYTExICogYjA4ICsgYTEzICogYjA2LFxuICAgICAgYTAxICogYjA4IC0gYTAwICogYjEwIC0gYTAzICogYjA2LFxuICAgICAgYTMwICogYjA0IC0gYTMxICogYjAyICsgYTMzICogYjAwLFxuICAgICAgYTIxICogYjAyIC0gYTIwICogYjA0IC0gYTIzICogYjAwLFxuICAgICAgYTExICogYjA3IC0gYTEwICogYjA5IC0gYTEyICogYjA2LFxuICAgICAgYTAwICogYjA5IC0gYTAxICogYjA3ICsgYTAyICogYjA2LFxuICAgICAgYTMxICogYjAxIC0gYTMwICogYjAzIC0gYTMyICogYjAwLFxuICAgICAgYTIwICogYjAzIC0gYTIxICogYjAxICsgYTIyICogYjAwKSAvIGRldDtcbn1cbmBcbmV4cG9ydCBkZWZhdWx0IGdsc2xcbiIsIi8vIHNpbXBsZSBzaGFkZXIgdGFrZW4gZnJvbSBodHRwczovL3RocmVlanNmdW5kYW1lbnRhbHMub3JnL3RocmVlanMvbGVzc29ucy90aHJlZWpzLXNoYWRlcnRveS5odG1sXG4vLyB3aGljaCBpbiB0dXJuIGlzIGZyb20gaHR0cHM6Ly93d3cuc2hhZGVydG95LmNvbS92aWV3L01zWFN6TVxuaW1wb3J0IHsgU2hhZGVyRXh0ZW5zaW9uLCBFeHRlbmRlZE1hdGVyaWFsIH0gZnJvbSAnLi4vdXRpbHMvTWF0ZXJpYWxNb2RpZmllcic7XG5pbXBvcnQgd2FycGZ4IGZyb20gJy4uL2Fzc2V0cy93YXJwZngucG5nJ1xuaW1wb3J0IHNub2lzZSBmcm9tICcuL3Nub2lzZSdcbmltcG9ydCBpbnZlcnNlNHg0IGZyb20gJy4vaW52ZXJzZSdcblxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuY29uc3QgdW5pZm9ybXMgPSB7XG4gICAgd2FycFRpbWU6IHt2YWx1ZTogMH0sXG4gICAgd2FycFRleDoge3ZhbHVlOiBudWxsfSxcbiAgICB0ZXhSZXBlYXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDEsMSkgfSxcbiAgICB0ZXhPZmZzZXQ6IHsgdmFsdWU6IG5ldyBUSFJFRS5WZWN0b3IyKDAsMCkgfSxcbiAgICB0ZXhGbGlwWTogeyB2YWx1ZTogMCB9LFxuICAgIHBvcnRhbEN1YmVNYXA6IHsgdmFsdWU6IG5ldyBUSFJFRS5DdWJlVGV4dHVyZSgpIH0sXG4gICAgcG9ydGFsVGltZTogeyB2YWx1ZTogMCB9LFxuICAgIHBvcnRhbFJhZGl1czogeyB2YWx1ZTogMC41IH0sXG4gICAgcG9ydGFsUmluZ0NvbG9yOiB7IHZhbHVlOiBuZXcgVEhSRUUuQ29sb3IoXCJyZWRcIikgIH0sXG4gICAgaW52ZXJ0V2FycENvbG9yOiB7IHZhbHVlOiAwIH0sXG4gICAgdGV4SW52U2l6ZTogeyB2YWx1ZTogbmV3IFRIUkVFLlZlY3RvcjIoMSwxKSB9XG59IFxuXG5pbnRlcmZhY2UgRXh0cmFCaXRzIHtcbiAgICBtYXA6IFRIUkVFLlRleHR1cmVcbn1cblxubGV0IGN1YmVNYXAgPSBuZXcgVEhSRUUuQ3ViZVRleHR1cmUoKVxuXG5jb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpXG52YXIgd2FycFRleDogVEhSRUUuVGV4dHVyZVxubG9hZGVyLmxvYWQod2FycGZ4LCAod2FycCkgPT4ge1xuICAgIHdhcnAubWluRmlsdGVyID0gVEhSRUUuTmVhcmVzdE1pcG1hcE5lYXJlc3RGaWx0ZXI7XG4gICAgd2FycC5tYWdGaWx0ZXIgPSBUSFJFRS5OZWFyZXN0TWlwbWFwTmVhcmVzdEZpbHRlcjtcbiAgICB3YXJwLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgd2FycC53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIHdhcnBUZXggPSB3YXJwXG4gICAgY3ViZU1hcC5pbWFnZXMgPSBbd2FycC5pbWFnZSwgd2FycC5pbWFnZSwgd2FycC5pbWFnZSwgd2FycC5pbWFnZSwgd2FycC5pbWFnZSwgd2FycC5pbWFnZV1cbiAgICBjdWJlTWFwLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubGV0IFdhcnBQb3J0YWxTaGFkZXI6IFNoYWRlckV4dGVuc2lvbiA9IHtcbiAgICB1bmlmb3JtczogdW5pZm9ybXMsXG4gICAgdmVydGV4U2hhZGVyOiB7XG4gICAgICAgIGZ1bmN0aW9uczogaW52ZXJzZTR4NCxcbiAgICAgICAgdW5pZm9ybXM6IGdsc2xgXG4gICAgICAgIHZhcnlpbmcgdmVjMyB2UmF5O1xuICAgICAgICB2YXJ5aW5nIHZlYzMgcG9ydGFsTm9ybWFsO1xuICAgICAgICAvL3ZhcnlpbmcgdmVjMyBjYW1lcmFMb2NhbDtcbiAgICAgICAgYCxcbiAgICAgICAgcG9zdFRyYW5zZm9ybTogZ2xzbGBcbiAgICAgICAgLy8gdmVjMyBjYW1lcmFMb2NhbCA9IChpbnZlcnNlTWF0KG1vZGVsTWF0cml4KSAqIHZlYzQoY2FtZXJhUG9zaXRpb24sIDEuMCkpLnh5ejtcbiAgICAgICAgdmVjMyBjYW1lcmFMb2NhbCA9IChpbnZlcnNlTWF0KG1vZGVsVmlld01hdHJpeCkgKiB2ZWM0KDAuMCwwLjAsMC4wLCAxLjApKS54eXo7XG4gICAgICAgIHZSYXkgPSBwb3NpdGlvbiAtIGNhbWVyYUxvY2FsO1xuICAgICAgICBpZiAodlJheS56IDwgMC4wKSB7XG4gICAgICAgICAgICB2UmF5LnogPSAtdlJheS56O1xuICAgICAgICAgICAgdlJheS54ID0gLXZSYXkueDtcbiAgICAgICAgfVxuICAgICAgICAvL3ZSYXkgPSB2ZWMzKG12UG9zaXRpb24ueCwgbXZQb3NpdGlvbi55LCBtdlBvc2l0aW9uLnopO1xuICAgICAgICBwb3J0YWxOb3JtYWwgPSBub3JtYWxpemUoLTEuICogdlJheSk7XG4gICAgICAgIC8vZmxvYXQgcG9ydGFsX2Rpc3QgPSBsZW5ndGgoY2FtZXJhTG9jYWwpO1xuICAgICAgICBmbG9hdCBwb3J0YWxfZGlzdCA9IGxlbmd0aCh2UmF5KTtcbiAgICAgICAgdlJheS56ICo9IDEuMSAvICgxLiArIHBvdyhwb3J0YWxfZGlzdCwgMC41KSk7IC8vIENoYW5nZSBGT1YgYnkgc3F1YXNoaW5nIGxvY2FsIFogZGlyZWN0aW9uXG4gICAgICBgXG4gICAgfSxcblxuICAgIGZyYWdtZW50U2hhZGVyOiB7XG4gICAgICAgIGZ1bmN0aW9uczogc25vaXNlLFxuICAgICAgICB1bmlmb3JtczogZ2xzbGBcbiAgICAgICAgdW5pZm9ybSBzYW1wbGVyQ3ViZSBwb3J0YWxDdWJlTWFwO1xuICAgICAgICB1bmlmb3JtIGZsb2F0IHBvcnRhbFJhZGl1cztcbiAgICAgICAgdW5pZm9ybSB2ZWMzIHBvcnRhbFJpbmdDb2xvcjtcbiAgICAgICAgdW5pZm9ybSBmbG9hdCBwb3J0YWxUaW1lO1xuICAgICAgICB1bmlmb3JtIGludCBpbnZlcnRXYXJwQ29sb3I7XG5cbiAgICAgICAgdW5pZm9ybSB2ZWMyIHRleEludlNpemU7XG5cbiAgICAgICAgdmFyeWluZyB2ZWMzIHZSYXk7XG4gICAgICAgIHZhcnlpbmcgdmVjMyBwb3J0YWxOb3JtYWw7XG4gICAgICAgLy8gdmFyeWluZyB2ZWMzIGNhbWVyYUxvY2FsO1xuXG4gICAgICAgIHVuaWZvcm0gZmxvYXQgd2FycFRpbWU7XG4gICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHdhcnBUZXg7XG4gICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhSZXBlYXQ7XG4gICAgICAgIHVuaWZvcm0gdmVjMiB0ZXhPZmZzZXQ7XG4gICAgICAgIHVuaWZvcm0gaW50IHRleEZsaXBZOyBcblxuICAgICAgICAjZGVmaW5lIFJJTkdfV0lEVEggMC4xXG4gICAgICAgICNkZWZpbmUgUklOR19IQVJEX09VVEVSIDAuMDFcbiAgICAgICAgI2RlZmluZSBSSU5HX0hBUkRfSU5ORVIgMC4wOFxuICAgICAgICBgLFxuICAgICAgICByZXBsYWNlTWFwOiBnbHNsYFxuICAgICAgICAgIGZsb2F0IHQgPSB3YXJwVGltZTtcblxuICAgICAgICAgIHZlYzIgdXYgPSBtb2QodlV2Lnh5LCB2ZWMyKDEuMCwxLjApKTsgLy9tb2QodlV2Lnh5ICogdGV4UmVwZWF0Lnh5ICsgdGV4T2Zmc2V0Lnh5LCB2ZWMyKDEuMCwxLjApKTtcblxuICAgICAgICAgIGlmICh1di54IDwgMC4wKSB7IHV2LnggPSB1di54ICsgMS4wO31cbiAgICAgICAgICBpZiAodXYueSA8IDAuMCkgeyB1di55ID0gdXYueSArIDEuMDt9XG4gICAgICAgICAgaWYgKHRleEZsaXBZID4gMCkgeyB1di55ID0gMS4wIC0gdXYueTt9XG4gICAgICAgICAgdXYueCA9IGNsYW1wKHV2LngsIDAuMCwgMS4wKTtcbiAgICAgICAgICB1di55ID0gY2xhbXAodXYueSwgMC4wLCAxLjApO1xuICBcbiAgICAgICAgICB2ZWMyIHNjYWxlZFVWID0gdXYgKiAyLjAgLSAxLjA7XG4gICAgICAgICAgdmVjMiBwdXYgPSB2ZWMyKGxlbmd0aChzY2FsZWRVVi54eSksIGF0YW4oc2NhbGVkVVYueCwgc2NhbGVkVVYueSkpO1xuICAgICAgICAgIHZlYzQgY29sID0gdGV4dHVyZTJEKHdhcnBUZXgsIHZlYzIobG9nKHB1di54KSArIHQgLyA1LjAsIHB1di55IC8gMy4xNDE1OTI2ICkpO1xuXG4gICAgICAgICAgZmxvYXQgZ2xvdyA9ICgxLjAgLSBwdXYueCkgKiAoMC41ICsgKHNpbih0KSArIDIuMCApIC8gNC4wKTtcbiAgICAgICAgICAvLyBibHVlIGdsb3dcbiAgICAgICAgICBjb2wgKz0gdmVjNCgxMTguMC8yNTUuMCwgMTQ0LjAvMjU1LjAsIDIxOS4wLzI1NS4wLCAxLjApICogKDAuNCArIGdsb3cgKiAxLjApO1xuICAgICAgICAgIC8vIHdoaXRlIGdsb3dcbiAgICAgICAgICBjb2wgKz0gdmVjNCgwLjIpICogc21vb3Roc3RlcCgwLjAsIDIuMCwgZ2xvdyAqIGdsb3cpO1xuICAgICAgICAgIGNvbCA9IG1hcFRleGVsVG9MaW5lYXIoIGNvbCApO1xuICAgICAgICAgXG4gICAgICAgICAgaWYgKGludmVydFdhcnBDb2xvciA+IDApIHtcbiAgICAgICAgICAgICAgY29sID0gdmVjNChjb2wuYiwgY29sLmcsIGNvbC5yLCBjb2wuYSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8vIHBvcnRhbCBzaGFkZXIgZWZmZWN0XG4gICAgICAgICAgdmVjMiBwb3J0YWxfY29vcmQgPSB2VXYgKiAyLjAgLSAxLjA7XG4gICAgICAgICAgZmxvYXQgcG9ydGFsX25vaXNlID0gc25vaXNlKHZlYzMocG9ydGFsX2Nvb3JkICogMS4sIHBvcnRhbFRpbWUpKSAqIDAuNSArIDAuNTtcbiAgICAgICAgXG4gICAgICAgICAgLy8gUG9sYXIgZGlzdGFuY2VcbiAgICAgICAgICBmbG9hdCBwb3J0YWxfZGlzdCA9IGxlbmd0aChwb3J0YWxfY29vcmQpO1xuICAgICAgICAgIHBvcnRhbF9kaXN0ICs9IHBvcnRhbF9ub2lzZSAqIDAuMjtcbiAgICAgICAgXG4gICAgICAgICAgZmxvYXQgbWFza091dGVyID0gMS4wIC0gc21vb3Roc3RlcChwb3J0YWxSYWRpdXMgLSBSSU5HX0hBUkRfT1VURVIsIHBvcnRhbFJhZGl1cywgcG9ydGFsX2Rpc3QpO1xuICAgICAgICAgIGZsb2F0IG1hc2tJbm5lciA9IDEuMCAtIHNtb290aHN0ZXAocG9ydGFsUmFkaXVzIC0gUklOR19XSURUSCwgcG9ydGFsUmFkaXVzIC0gUklOR19XSURUSCArIFJJTkdfSEFSRF9JTk5FUiwgcG9ydGFsX2Rpc3QpO1xuICAgICAgICAgIGZsb2F0IHBvcnRhbF9kaXN0b3J0aW9uID0gc21vb3Roc3RlcChwb3J0YWxSYWRpdXMgLSAwLjIsIHBvcnRhbFJhZGl1cyArIDAuMiwgcG9ydGFsX2Rpc3QpO1xuICAgICAgICAgIFxuICAgICAgICAgIHZlYzMgcG9ydGFsbm9ybWFsID0gbm9ybWFsaXplKHBvcnRhbE5vcm1hbCk7XG4gICAgICAgICAgdmVjMyBmb3J3YXJkUG9ydGFsID0gdmVjMygwLjAsIDAuMCwgLTEuMCk7XG5cbiAgICAgICAgICBmbG9hdCBwb3J0YWxfZGlyZWN0VmlldyA9IHNtb290aHN0ZXAoMC4wLCAwLjgsIGRvdChwb3J0YWxub3JtYWwsIGZvcndhcmRQb3J0YWwpKTtcbiAgICAgICAgICB2ZWMzIHBvcnRhbF90YW5nZW50T3V0d2FyZCA9IG5vcm1hbGl6ZSh2ZWMzKHBvcnRhbF9jb29yZCwgMC4wKSk7XG4gICAgICAgICAgdmVjMyBwb3J0YWxfcmF5ID0gbWl4KHZSYXksIHBvcnRhbF90YW5nZW50T3V0d2FyZCwgcG9ydGFsX2Rpc3RvcnRpb24pO1xuXG4gICAgICAgICAgdmVjNCBteUN1YmVUZXhlbCA9IHRleHR1cmVDdWJlKHBvcnRhbEN1YmVNYXAsIHBvcnRhbF9yYXkpO1xuXG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgKz0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgbm9ybWFsaXplKHZlYzMocG9ydGFsX3JheS54IC0gdGV4SW52U2l6ZS5zLCBwb3J0YWxfcmF5Lnl6KSkpIC8gOC4wOyAgICAgICAgXG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgKz0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgbm9ybWFsaXplKHZlYzMocG9ydGFsX3JheS54IC0gdGV4SW52U2l6ZS5zLCBwb3J0YWxfcmF5Lnl6KSkpIC8gOC4wOyAgICAgICAgXG4gICAgICAgIC8vICAgbXlDdWJlVGV4ZWwgKz0gdGV4dHVyZUN1YmUocG9ydGFsQ3ViZU1hcCwgbm9ybWFsaXplKHZlYzMocG9ydGFsX3JheS54LCBwb3J0YWxfcmF5LnkgLSB0ZXhJbnZTaXplLnQsIHBvcnRhbF9yYXkueikpKSAvIDguMDsgICAgICAgIFxuICAgICAgICAvLyAgIG15Q3ViZVRleGVsICs9IHRleHR1cmVDdWJlKHBvcnRhbEN1YmVNYXAsIG5vcm1hbGl6ZSh2ZWMzKHBvcnRhbF9yYXkueCwgcG9ydGFsX3JheS55IC0gdGV4SW52U2l6ZS50LCBwb3J0YWxfcmF5LnopKSkgLyA4LjA7ICAgICAgICBcblxuICAgICAgICAgIG15Q3ViZVRleGVsID0gbWFwVGV4ZWxUb0xpbmVhciggbXlDdWJlVGV4ZWwgKTtcblxuICAgICAgICAvLyAgIHZlYzQgcG9zQ29sID0gdmVjNChzbW9vdGhzdGVwKC02LjAsIDYuMCwgY2FtZXJhTG9jYWwpLCAxLjApOyAvL25vcm1hbGl6ZSgoY2FtZXJhTG9jYWwgLyA2LjApKTtcbiAgICAgICAgLy8gICBteUN1YmVUZXhlbCA9IHBvc0NvbDsgLy8gdmVjNChwb3NDb2wueCwgcG9zQ29sLnksIHBvc0NvbC55LCAxLjApO1xuICAgICAgICAgIHZlYzMgY2VudGVyTGF5ZXIgPSBteUN1YmVUZXhlbC5yZ2IgKiBtYXNrSW5uZXI7XG4gICAgICAgICAgdmVjMyByaW5nTGF5ZXIgPSBwb3J0YWxSaW5nQ29sb3IgKiAoMS4gLSBtYXNrSW5uZXIpO1xuICAgICAgICAgIHZlYzMgcG9ydGFsX2NvbXBvc2l0ZSA9IGNlbnRlckxheWVyICsgcmluZ0xheWVyO1xuICAgICAgICBcbiAgICAgICAgICAvL2dsX0ZyYWdDb2xvciBcbiAgICAgICAgICB2ZWM0IHBvcnRhbENvbCA9IHZlYzQocG9ydGFsX2NvbXBvc2l0ZSwgKG1hc2tPdXRlciAtIG1hc2tJbm5lcikgKyBtYXNrSW5uZXIgKiBwb3J0YWxfZGlyZWN0Vmlldyk7XG4gICAgICAgIFxuICAgICAgICAgIC8vIGJsZW5kIHRoZSB0d29cbiAgICAgICAgICBwb3J0YWxDb2wucmdiICo9IHBvcnRhbENvbC5hOyAvL3ByZW11bHRpcGx5IHNvdXJjZSBcbiAgICAgICAgICBjb2wucmdiICo9ICgxLjAgLSBwb3J0YWxDb2wuYSk7XG4gICAgICAgICAgY29sLnJnYiArPSBwb3J0YWxDb2wucmdiO1xuXG4gICAgICAgICAgZGlmZnVzZUNvbG9yICo9IGNvbDtcbiAgICAgICAgYFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24obWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCkge1xuICAgICAgICBsZXQgbWF0ID0gKG1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCAmIEV4dHJhQml0cylcblxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhSZXBlYXQgPSB7IHZhbHVlOiBtYXQubWFwICYmIG1hdC5tYXAucmVwZWF0ID8gbWF0Lm1hcC5yZXBlYXQgOiBuZXcgVEhSRUUuVmVjdG9yMigxLDEpIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMudGV4T2Zmc2V0ID0geyB2YWx1ZTogbWF0Lm1hcCAmJiBtYXQubWFwLm9mZnNldCA/IG1hdC5tYXAub2Zmc2V0IDogbmV3IFRIUkVFLlZlY3RvcjIoMCwwKSB9XG4gICAgICAgIC8vIHdlIHNlZW0gdG8gd2FudCB0byBmbGlwIHRoZSBmbGlwWVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhGbGlwWSA9IHsgdmFsdWU6IG1hdC5tYXAgJiYgbWF0Lm1hcC5mbGlwWSA/IDAgOiAxIH1cbiAgICAgICAgbWF0ZXJpYWwudXNlckRhdGEudGltZU9mZnNldCA9IChNYXRoLnJhbmRvbSgpKzAuNSkgKiAxMFxuXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUZXgudmFsdWUgPSB3YXJwVGV4XG5cbiAgICAgICAgLy8gd2Ugc2VlbSB0byB3YW50IHRvIGZsaXAgdGhlIGZsaXBZXG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLndhcnBUaW1lID0geyB2YWx1ZTogMCB9XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFRpbWUgPSB7IHZhbHVlOiAwIH1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMuaW52ZXJ0V2FycENvbG9yID0geyB2YWx1ZTogbWF0LnVzZXJEYXRhLmludmVydFdhcnBDb2xvciA/IG1hdC51c2VyRGF0YS5pbnZlcnRXYXJwQ29sb3IgOiBmYWxzZX1cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsUmluZ0NvbG9yID0geyB2YWx1ZTogbWF0LnVzZXJEYXRhLnJpbmdDb2xvciA/IG1hdC51c2VyRGF0YS5yaW5nQ29sb3IgOiBuZXcgVEhSRUUuQ29sb3IoXCJyZWRcIikgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxDdWJlTWFwID0geyB2YWx1ZTogbWF0LnVzZXJEYXRhLmN1YmVNYXAgPyBtYXQudXNlckRhdGEuY3ViZU1hcCA6IGN1YmVNYXAgfVxuICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy5wb3J0YWxSYWRpdXMgPSAge3ZhbHVlOiBtYXQudXNlckRhdGEucmFkaXVzID8gbWF0LnVzZXJEYXRhLnJhZGl1cyA6IDAuNX1cbiAgICB9LFxuICAgIHVwZGF0ZVVuaWZvcm1zOiBmdW5jdGlvbih0aW1lOiBudW1iZXIsIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpIHtcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRpbWUudmFsdWUgPSB0aW1lICogMC4wMDEgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG4gICAgICAgIG1hdGVyaWFsLnVuaWZvcm1zLnBvcnRhbFRpbWUudmFsdWUgPSB0aW1lICogMC4wMDEgKyBtYXRlcmlhbC51c2VyRGF0YS50aW1lT2Zmc2V0XG5cbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMud2FycFRleC52YWx1ZSA9IHdhcnBUZXhcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsQ3ViZU1hcC52YWx1ZSA9IG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAgPyBtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwIDogY3ViZU1hcCBcbiAgICAgICAgbWF0ZXJpYWwudW5pZm9ybXMucG9ydGFsUmFkaXVzLnZhbHVlID0gbWF0ZXJpYWwudXNlckRhdGEucmFkaXVzID8gbWF0ZXJpYWwudXNlckRhdGEucmFkaXVzIDogMC41XG5cbiAgICAgICAgaWYgKG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAgJiYgQXJyYXkuaXNBcnJheShtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwLmltYWdlcykgJiYgbWF0ZXJpYWwudXNlckRhdGEuY3ViZU1hcC5pbWFnZXNbMF0pIHtcbiAgICAgICAgICAgIGxldCBoZWlnaHQgPSBtYXRlcmlhbC51c2VyRGF0YS5jdWJlTWFwLmltYWdlc1swXS5oZWlnaHRcbiAgICAgICAgICAgIGxldCB3aWR0aCA9IG1hdGVyaWFsLnVzZXJEYXRhLmN1YmVNYXAuaW1hZ2VzWzBdLndpZHRoXG4gICAgICAgICAgICBtYXRlcmlhbC51bmlmb3Jtcy50ZXhJbnZTaXplLnZhbHVlID0gbmV3IFRIUkVFLlZlY3RvcjIod2lkdGgsIGhlaWdodCk7XG4gICAgICAgIH1cblxuICAgIH1cbn1cblxuXG5leHBvcnQgeyBXYXJwUG9ydGFsU2hhZGVyIH1cbiIsIi8qKlxuICogVmFyaW91cyBzaW1wbGUgc2hhZGVyc1xuICovXG5cbi8vIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy9Nc1hTek06ICBCbGVlcHkgQmxvY2tzXG5pbXBvcnQgeyBTaGFkZXJFeHRlbnNpb24sIEV4dGVuZGVkTWF0ZXJpYWwsIERlZmF1bHRNYXRlcmlhbE1vZGlmaWVyIGFzIE1hdGVyaWFsTW9kaWZpZXIsIFNoYWRlckV4dGVuc2lvbk9wdHMgfSBmcm9tICcuLi91dGlscy9NYXRlcmlhbE1vZGlmaWVyJ1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gJy4uL3V0aWxzL3NjZW5lLWdyYXBoJ1xuXG4vLyBhZGQgIGh0dHBzOi8vd3d3LnNoYWRlcnRveS5jb20vdmlldy83ZEtHenpcblxuaW1wb3J0IHsgQmxlZXB5QmxvY2tzU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9ibGVlcHktYmxvY2tzLXNoYWRlcidcbmltcG9ydCB7IE5vaXNlU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9ub2lzZSdcbmltcG9ydCB7IExpcXVpZE1hcmJsZVNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbGlxdWlkLW1hcmJsZSdcbmltcG9ydCB7IEdhbGF4eVNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvZ2FsYXh5J1xuaW1wb3J0IHsgTGFjZVR1bm5lbFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvbGFjZS10dW5uZWwnXG5pbXBvcnQgeyBGaXJlVHVubmVsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9maXJlLXR1bm5lbCdcbmltcG9ydCB7IE1pc3RTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL21pc3QnXG5pbXBvcnQgeyBNYXJibGUxU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy9tYXJibGUxJ1xuaW1wb3J0IHsgTm90Rm91bmRTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL25vdC1mb3VuZCdcbmltcG9ydCB7IFdhcnBTaGFkZXIgfSBmcm9tICcuLi9zaGFkZXJzL3dhcnAnXG5pbXBvcnQgeyBXYXJwUG9ydGFsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy93YXJwLXBvcnRhbCdcblxuZnVuY3Rpb24gbWFwTWF0ZXJpYWxzKG9iamVjdDNEOiBUSFJFRS5PYmplY3QzRCwgZm46IChtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwpID0+IHZvaWQpIHtcbiAgICBsZXQgbWVzaCA9IG9iamVjdDNEIGFzIFRIUkVFLk1lc2hcbiAgICBpZiAoIW1lc2gubWF0ZXJpYWwpIHJldHVybjtcbiAgXG4gICAgaWYgKEFycmF5LmlzQXJyYXkobWVzaC5tYXRlcmlhbCkpIHtcbiAgICAgIHJldHVybiBtZXNoLm1hdGVyaWFsLm1hcChmbik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmbihtZXNoLm1hdGVyaWFsKTtcbiAgICB9XG59XG4gIFxuICAvLyBUT0RPOiAga2V5IGEgcmVjb3JkIG9mIG5ldyBtYXRlcmlhbHMsIGluZGV4ZWQgYnkgdGhlIG9yaWdpbmFsXG4gIC8vIG1hdGVyaWFsIFVVSUQsIHNvIHdlIGNhbiBqdXN0IHJldHVybiBpdCBpZiByZXBsYWNlIGlzIGNhbGxlZCBvblxuICAvLyB0aGUgc2FtZSBtYXRlcmlhbCBtb3JlIHRoYW4gb25jZVxuICBleHBvcnQgZnVuY3Rpb24gcmVwbGFjZU1hdGVyaWFsIChvbGRNYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwsIHNoYWRlcjogU2hhZGVyRXh0ZW5zaW9uLCB1c2VyRGF0YTogYW55KTogbnVsbCB8IFRIUkVFLk1hdGVyaWFsICYgRXh0ZW5kZWRNYXRlcmlhbCB7XG4gICAgLy8gICBpZiAob2xkTWF0ZXJpYWwudHlwZSAhPSBcIk1lc2hTdGFuZGFyZE1hdGVyaWFsXCIpIHtcbiAgICAvLyAgICAgICBjb25zb2xlLndhcm4oXCJTaGFkZXIgQ29tcG9uZW50OiBkb24ndCBrbm93IGhvdyB0byBoYW5kbGUgU2hhZGVycyBvZiB0eXBlICdcIiArIG9sZE1hdGVyaWFsLnR5cGUgKyBcIicsIG9ubHkgTWVzaFN0YW5kYXJkTWF0ZXJpYWwgYXQgdGhpcyB0aW1lLlwiKVxuICAgIC8vICAgICAgIHJldHVybjtcbiAgICAvLyAgIH1cblxuICAgICAgLy9jb25zdCBtYXRlcmlhbCA9IG9sZE1hdGVyaWFsLmNsb25lKCk7XG4gICAgICB2YXIgQ3VzdG9tTWF0ZXJpYWxcbiAgICAgIHRyeSB7XG4gICAgICAgICAgQ3VzdG9tTWF0ZXJpYWwgPSBNYXRlcmlhbE1vZGlmaWVyLmV4dGVuZCAob2xkTWF0ZXJpYWwudHlwZSwge1xuICAgICAgICAgICAgdW5pZm9ybXM6IHNoYWRlci51bmlmb3JtcyxcbiAgICAgICAgICAgIHZlcnRleFNoYWRlcjogc2hhZGVyLnZlcnRleFNoYWRlcixcbiAgICAgICAgICAgIGZyYWdtZW50U2hhZGVyOiBzaGFkZXIuZnJhZ21lbnRTaGFkZXJcbiAgICAgICAgICB9KVxuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIC8vIGNyZWF0ZSBhIG5ldyBtYXRlcmlhbCwgaW5pdGlhbGl6aW5nIHRoZSBiYXNlIHBhcnQgd2l0aCB0aGUgb2xkIG1hdGVyaWFsIGhlcmVcbiAgICAgIGxldCBtYXRlcmlhbCA9IG5ldyBDdXN0b21NYXRlcmlhbCgpXG5cbiAgICAgIHN3aXRjaCAob2xkTWF0ZXJpYWwudHlwZSkge1xuICAgICAgICAgIGNhc2UgXCJNZXNoU3RhbmRhcmRNYXRlcmlhbFwiOlxuICAgICAgICAgICAgICBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbC5wcm90b3R5cGUuY29weS5jYWxsKG1hdGVyaWFsLCBvbGRNYXRlcmlhbClcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBcIk1lc2hQaG9uZ01hdGVyaWFsXCI6XG4gICAgICAgICAgICAgIFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsLnByb3RvdHlwZS5jb3B5LmNhbGwobWF0ZXJpYWwsIG9sZE1hdGVyaWFsKVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwiTWVzaEJhc2ljTWF0ZXJpYWxcIjpcbiAgICAgICAgICAgICAgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwucHJvdG90eXBlLmNvcHkuY2FsbChtYXRlcmlhbCwgb2xkTWF0ZXJpYWwpXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBtYXRlcmlhbC51c2VyRGF0YSA9IHVzZXJEYXRhO1xuICAgICAgbWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgc2hhZGVyLmluaXQobWF0ZXJpYWwpO1xuICAgICAgXG4gICAgICByZXR1cm4gbWF0ZXJpYWxcbiAgfVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlV2l0aFNoYWRlcihzaGFkZXJEZWY6IFNoYWRlckV4dGVuc2lvbiwgZWw6IGFueSwgdGFyZ2V0OiBzdHJpbmcsIHVzZXJEYXRhOiBhbnkgPSB7fSk6IChUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpW10ge1xuICAgIC8vIG1lc2ggd291bGQgY29udGFpbiB0aGUgb2JqZWN0IHRoYXQgaXMsIG9yIGNvbnRhaW5zLCB0aGUgbWVzaGVzXG4gICAgdmFyIG1lc2ggPSBlbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgaWYgKCFtZXNoKSB7XG4gICAgICAgIC8vIGlmIG5vIG1lc2gsIHdlJ2xsIHNlYXJjaCB0aHJvdWdoIGFsbCBvZiB0aGUgY2hpbGRyZW4uICBUaGlzIHdvdWxkXG4gICAgICAgIC8vIGhhcHBlbiBpZiB3ZSBkcm9wcGVkIHRoZSBjb21wb25lbnQgb24gYSBnbGIgaW4gc3Bva2VcbiAgICAgICAgbWVzaCA9IGVsLm9iamVjdDNEXG4gICAgfVxuICAgIFxuICAgIGxldCBtYXRlcmlhbHM6IGFueSA9IFtdXG4gICAgbGV0IHRyYXZlcnNlID0gKG9iamVjdDogVEhSRUUuT2JqZWN0M0QpID0+IHtcbiAgICAgIGxldCBtZXNoID0gb2JqZWN0IGFzIFRIUkVFLk1lc2hcbiAgICAgIGlmIChtZXNoLm1hdGVyaWFsKSB7XG4gICAgICAgICAgbWFwTWF0ZXJpYWxzKG1lc2gsIChtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwpID0+IHsgICAgICAgICBcbiAgICAgICAgICAgICAgaWYgKCF0YXJnZXQgfHwgbWF0ZXJpYWwubmFtZSA9PT0gdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICBsZXQgbmV3TSA9IHJlcGxhY2VNYXRlcmlhbChtYXRlcmlhbCwgc2hhZGVyRGVmLCB1c2VyRGF0YSlcbiAgICAgICAgICAgICAgICAgIGlmIChuZXdNKSB7XG4gICAgICAgICAgICAgICAgICAgICAgbWVzaC5tYXRlcmlhbCA9IG5ld01cblxuICAgICAgICAgICAgICAgICAgICAgIG1hdGVyaWFscy5wdXNoKG5ld00pXG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgfVxuICAgICAgY29uc3QgY2hpbGRyZW4gPSBvYmplY3QuY2hpbGRyZW47XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgdHJhdmVyc2UoY2hpbGRyZW5baV0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRyYXZlcnNlKG1lc2gpO1xuICAgIHJldHVybiBtYXRlcmlhbHNcbiAgfVxuXG5jb25zdCB2ZWMgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCBmb3J3YXJkID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMSlcblxuY29uc3Qgb25jZSA9IHtcbiAgICBvbmNlIDogdHJ1ZVxufTtcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdzaGFkZXInLCB7XG4gICAgbWF0ZXJpYWxzOiBudWxsIGFzIChUSFJFRS5NYXRlcmlhbCAmIEV4dGVuZGVkTWF0ZXJpYWwpW10gfCBudWxsLCAgXG4gICAgc2hhZGVyRGVmOiBudWxsIGFzIFNoYWRlckV4dGVuc2lvbiB8IG51bGwsXG5cbiAgICBzY2hlbWE6IHtcbiAgICAgICAgbmFtZTogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogXCJub2lzZVwiIH0sXG4gICAgICAgIHRhcmdldDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogXCJcIiB9ICAvLyBpZiBub3RoaW5nIHBhc3NlZCwganVzdCBjcmVhdGUgc29tZSBub2lzZVxuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzaGFkZXJEZWY6IFNoYWRlckV4dGVuc2lvbjtcblxuICAgICAgICBzd2l0Y2ggKHRoaXMuZGF0YS5uYW1lKSB7XG4gICAgICAgICAgICBjYXNlIFwibm9pc2VcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBOb2lzZVNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwid2FycFwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IFdhcnBTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcIndhcnAtcG9ydGFsXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gV2FycFBvcnRhbFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwibGlxdWlkbWFyYmxlXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTGlxdWlkTWFyYmxlU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIFxuICAgICAgICAgICAgY2FzZSBcImJsZWVweWJsb2Nrc1wiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IEJsZWVweUJsb2Nrc1NoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwiZ2FsYXh5XCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gR2FsYXh5U2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJsYWNldHVubmVsXCI6XG4gICAgICAgICAgICAgICAgc2hhZGVyRGVmID0gTGFjZVR1bm5lbFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIFwiZmlyZXR1bm5lbFwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IEZpcmVUdW5uZWxTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgXG4gICAgICAgICAgICBjYXNlIFwibWlzdFwiOlxuICAgICAgICAgICAgICAgIHNoYWRlckRlZiA9IE1pc3RTaGFkZXJcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcIm1hcmJsZTFcIjpcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBNYXJibGUxU2hhZGVyXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgLy8gYW4gdW5rbm93biBuYW1lIHdhcyBwYXNzZWQgaW5cbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ1bmtub3duIG5hbWUgJ1wiICsgdGhpcy5kYXRhLm5hbWUgKyBcIicgcGFzc2VkIHRvIHNoYWRlciBjb21wb25lbnRcIilcbiAgICAgICAgICAgICAgICBzaGFkZXJEZWYgPSBOb3RGb3VuZFNoYWRlclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IFxuXG4gICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICBsZXQgdXBkYXRlTWF0ZXJpYWxzID0gKCkgPT57XG4gICAgICAgICAgICBsZXQgdGFyZ2V0ID0gdGhpcy5kYXRhLnRhcmdldFxuICAgICAgICAgICAgaWYgKHRhcmdldC5sZW5ndGggPT0gMCkge3RhcmdldD1udWxsfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICB0aGlzLm1hdGVyaWFscyA9IHVwZGF0ZVdpdGhTaGFkZXIoc2hhZGVyRGVmLCB0aGlzLmVsLCB0YXJnZXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGluaXRpYWxpemVyID0gKCkgPT57XG4gICAgICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4gICAgICAgICAgICAgICAgbGV0IGZuID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGVNYXRlcmlhbHMoKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgZm4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCBmbilcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdXBkYXRlTWF0ZXJpYWxzKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByb290ICYmIChyb290IGFzIEhUTUxFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIGluaXRpYWxpemVyLCBvbmNlKTtcbiAgICAgICAgdGhpcy5zaGFkZXJEZWYgPSBzaGFkZXJEZWZcbiAgICB9LFxuXG5cbiAgdGljazogZnVuY3Rpb24odGltZSkge1xuICAgIGlmICh0aGlzLnNoYWRlckRlZiA9PSBudWxsIHx8IHRoaXMubWF0ZXJpYWxzID09IG51bGwpIHsgcmV0dXJuIH1cblxuICAgIGxldCBzaGFkZXJEZWYgPSB0aGlzLnNoYWRlckRlZlxuICAgIHRoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7c2hhZGVyRGVmLnVwZGF0ZVVuaWZvcm1zKHRpbWUsIG1hdCl9KVxuICAgIC8vIHN3aXRjaCAodGhpcy5kYXRhLm5hbWUpIHtcbiAgICAvLyAgICAgY2FzZSBcIm5vaXNlXCI6XG4gICAgLy8gICAgICAgICBicmVhaztcbiAgICAvLyAgICAgY2FzZSBcImJsZWVweWJsb2Nrc1wiOlxuICAgIC8vICAgICAgICAgYnJlYWs7XG4gICAgLy8gICAgIGRlZmF1bHQ6XG4gICAgLy8gICAgICAgICBicmVhaztcbiAgICAvLyB9XG5cbiAgICAvLyBpZiAodGhpcy5zaGFkZXIpIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coXCJmcmFnbWVudCBzaGFkZXI6XCIsIHRoaXMubWF0ZXJpYWwuZnJhZ21lbnRTaGFkZXIpXG4gICAgLy8gICAgIHRoaXMuc2hhZGVyID0gbnVsbFxuICAgIC8vIH1cbiAgfSxcbn0pXG5cbiIsImV4cG9ydCBjb25zdCBkb3dubG9hZEJsb2IgPSBmdW5jdGlvbiAoYmxvYiwgZmlsZW5hbWUpIHtcbiAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgIGEuZG93bmxvYWQgPSBmaWxlbmFtZTtcbiAgICBhLmhyZWYgPSB3aW5kb3cuVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICBhLmRhdGFzZXQuZG93bmxvYWR1cmwgPSBbJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbScsIGEuZG93bmxvYWQsIGEuaHJlZl0uam9pbignOicpO1xuICAgIGEuY2xpY2soKTtcbn07XG4iLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vd2lsbGlhbWNhc2V5bHVjYXMuZ2l0aHViLmlvL2NvcmUtY29tcG9uZW50cy8yYWViMDBiNjRhZTk1NjhmLmpwZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3dpbGxpYW1jYXNleWx1Y2FzLmdpdGh1Yi5pby9jb3JlLWNvbXBvbmVudHMvNTBhMWI2ZDMzOGNiMjQ2ZS5qcGdcIiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly93aWxsaWFtY2FzZXlsdWNhcy5naXRodWIuaW8vY29yZS1jb21wb25lbnRzL2FlYWIyMDkxZTRhNTNlOWQucG5nXCIiLCJleHBvcnQgZGVmYXVsdCBcImh0dHBzOi8vd2lsbGlhbWNhc2V5bHVjYXMuZ2l0aHViLmlvL2NvcmUtY29tcG9uZW50cy8wY2U0NmM0MjJmOTQ1YTk2LmpwZ1wiIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3dpbGxpYW1jYXNleWx1Y2FzLmdpdGh1Yi5pby9jb3JlLWNvbXBvbmVudHMvNmEzZThiNDMzMmQ0N2NlMi5qcGdcIiIsImxldCBTSVpFID0gMTAyNFxubGV0IFRBUkdFVFdJRFRIID0gU0laRVxubGV0IFRBUkdFVEhFSUdIVCA9IFNJWkVcblxud2luZG93LkFQUC53cml0ZVdheVBvaW50VGV4dHVyZXMgPSBmdW5jdGlvbihuYW1lcykge1xuICAgIGlmICggIUFycmF5LmlzQXJyYXkoIG5hbWVzICkgKSB7XG4gICAgICAgIG5hbWVzID0gWyBuYW1lcyBdXG4gICAgfVxuXG4gICAgZm9yICggbGV0IGsgPSAwOyBrIDwgbmFtZXMubGVuZ3RoOyBrKysgKSB7XG4gICAgICAgIGxldCB3YXlwb2ludHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKG5hbWVzW2tdKVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHdheXBvaW50c1tpXS5jb21wb25lbnRzLndheXBvaW50KSB7XG4gICAgICAgICAgICAgICAgbGV0IGN1YmVjYW0gPSBudWxsXG4gICAgICAgICAgICAgICAgLy8gXG4gICAgICAgICAgICAgICAgLy8gZm9yIChsZXQgaiA9IDA7IGogPCB3YXlwb2ludHNbaV0ub2JqZWN0M0QuY2hpbGRyZW4ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAvLyAgICAgaWYgKHdheXBvaW50c1tpXS5vYmplY3QzRC5jaGlsZHJlbltqXSBpbnN0YW5jZW9mIEN1YmVDYW1lcmFXcml0ZXIpIHtcbiAgICAgICAgICAgICAgICAvLyAgICAgICAgIGNvbnNvbGUubG9nKFwiZm91bmQgd2F5cG9pbnQgd2l0aCBjdWJlQ2FtZXJhICdcIiArIG5hbWVzW2tdICsgXCInXCIpXG4gICAgICAgICAgICAgICAgLy8gICAgICAgICBjdWJlY2FtID0gd2F5cG9pbnRzW2ldLm9iamVjdDNELmNoaWxkcmVuW2pdXG4gICAgICAgICAgICAgICAgLy8gICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAvLyAgICAgfVxuICAgICAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgICAgICAvLyBpZiAoIWN1YmVjYW0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJkaWRuJ3QgZmluZCB3YXlwb2ludCB3aXRoIGN1YmVDYW1lcmEgJ1wiICsgbmFtZXNba10gKyBcIicsIGNyZWF0aW5nIG9uZS5cIikgICAgICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSBhIGN1YmUgbWFwIGNhbWVyYSBhbmQgcmVuZGVyIHRoZSB2aWV3IVxuICAgICAgICAgICAgICAgICAgICBpZiAoVEhSRUUuUkVWSVNJT04gPCAxMjUpIHsgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1YmVjYW0gPSBuZXcgQ3ViZUNhbWVyYVdyaXRlcigwLjEsIDEwMDAsIFNJWkUpXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdWJlUmVuZGVyVGFyZ2V0ID0gbmV3IFRIUkVFLldlYkdMQ3ViZVJlbmRlclRhcmdldCggU0laRSwgeyBlbmNvZGluZzogVEhSRUUuc1JHQkVuY29kaW5nLCBnZW5lcmF0ZU1pcG1hcHM6IHRydWUgfSApXG4gICAgICAgICAgICAgICAgICAgICAgICBjdWJlY2FtID0gbmV3IEN1YmVDYW1lcmFXcml0ZXIoMSwgMTAwMDAwLCBjdWJlUmVuZGVyVGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBjdWJlY2FtLnBvc2l0aW9uLnkgPSAxLjZcbiAgICAgICAgICAgICAgICAgICAgY3ViZWNhbS5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgICAgICAgICAgd2F5cG9pbnRzW2ldLm9iamVjdDNELmFkZChjdWJlY2FtKVxuICAgICAgICAgICAgICAgICAgICBjdWJlY2FtLnVwZGF0ZSh3aW5kb3cuQVBQLnNjZW5lLnJlbmRlcmVyLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LkFQUC5zY2VuZS5vYmplY3QzRClcbiAgICAgICAgICAgICAgICAvLyB9ICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgY3ViZWNhbS5zYXZlQ3ViZU1hcFNpZGVzKG5hbWVzW2tdKVxuICAgICAgICAgICAgICAgIHdheXBvaW50c1tpXS5vYmplY3QzRC5yZW1vdmUoY3ViZWNhbSlcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuY2xhc3MgQ3ViZUNhbWVyYVdyaXRlciBleHRlbmRzIFRIUkVFLkN1YmVDYW1lcmEge1xuXG4gICAgY29uc3RydWN0b3IoLi4uYXJncykge1xuICAgICAgICBzdXBlciguLi5hcmdzKTtcblxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IFRBUkdFVFdJRFRIO1xuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSBUQVJHRVRIRUlHSFQ7XG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICAgICAgLy8gdGhpcy5yZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSB0cnVlO1xuICAgICAgICAvLyB0aGlzLnJlbmRlclRhcmdldC50ZXh0dXJlLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhck1pcE1hcExpbmVhckZpbHRlcjtcbiAgICAgICAgLy8gdGhpcy5yZW5kZXJUYXJnZXQudGV4dHVyZS5tYWdGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG5cbiAgICAgICAgLy8gdGhpcy51cGRhdGUgPSBmdW5jdGlvbiggcmVuZGVyZXIsIHNjZW5lICkge1xuXG4gICAgICAgIC8vICAgICBsZXQgWyBjYW1lcmFQWCwgY2FtZXJhTlgsIGNhbWVyYVBZLCBjYW1lcmFOWSwgY2FtZXJhUFosIGNhbWVyYU5aIF0gPSB0aGlzLmNoaWxkcmVuO1xuXG4gICAgXHQvLyBcdGlmICggdGhpcy5wYXJlbnQgPT09IG51bGwgKSB0aGlzLnVwZGF0ZU1hdHJpeFdvcmxkKCk7XG5cbiAgICBcdC8vIFx0aWYgKCB0aGlzLnBhcmVudCA9PT0gbnVsbCApIHRoaXMudXBkYXRlTWF0cml4V29ybGQoKTtcblxuICAgIFx0Ly8gXHR2YXIgY3VycmVudFJlbmRlclRhcmdldCA9IHJlbmRlcmVyLmdldFJlbmRlclRhcmdldCgpO1xuXG4gICAgXHQvLyBcdHZhciByZW5kZXJUYXJnZXQgPSB0aGlzLnJlbmRlclRhcmdldDtcbiAgICBcdC8vIFx0Ly92YXIgZ2VuZXJhdGVNaXBtYXBzID0gcmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzO1xuXG4gICAgXHQvLyBcdC8vcmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gZmFsc2U7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDAgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhUFggKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgMSApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFOWCApO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCAyICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYVBZICk7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCByZW5kZXJUYXJnZXQsIDMgKTtcbiAgICBcdC8vIFx0cmVuZGVyZXIucmVuZGVyKCBzY2VuZSwgY2FtZXJhTlkgKTtcblxuICAgIFx0Ly8gXHRyZW5kZXJlci5zZXRSZW5kZXJUYXJnZXQoIHJlbmRlclRhcmdldCwgNCApO1xuICAgIFx0Ly8gXHRyZW5kZXJlci5yZW5kZXIoIHNjZW5lLCBjYW1lcmFQWiApO1xuXG4gICAgXHQvLyBcdC8vcmVuZGVyVGFyZ2V0LnRleHR1cmUuZ2VuZXJhdGVNaXBtYXBzID0gZ2VuZXJhdGVNaXBtYXBzO1xuXG4gICAgXHQvLyBcdHJlbmRlcmVyLnNldFJlbmRlclRhcmdldCggcmVuZGVyVGFyZ2V0LCA1ICk7XG4gICAgXHQvLyBcdHJlbmRlcmVyLnJlbmRlciggc2NlbmUsIGNhbWVyYU5aICk7XG5cbiAgICBcdC8vIFx0cmVuZGVyZXIuc2V0UmVuZGVyVGFyZ2V0KCBjdXJyZW50UmVuZGVyVGFyZ2V0ICk7XG4gICAgICAgIC8vIH07XG5cdH1cblxuICAgIHNhdmVDdWJlTWFwU2lkZXMoc2x1Zykge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDY7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5jYXB0dXJlKHNsdWcsIGkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIGNhcHR1cmUgKHNsdWcsIHNpZGUpIHtcbiAgICAgICAgLy92YXIgaXNWUkVuYWJsZWQgPSB3aW5kb3cuQVBQLnNjZW5lLnJlbmRlcmVyLnhyLmVuYWJsZWQ7XG4gICAgICAgIHZhciByZW5kZXJlciA9IHdpbmRvdy5BUFAuc2NlbmUucmVuZGVyZXI7XG4gICAgICAgIC8vIERpc2FibGUgVlIuXG4gICAgICAgIC8vcmVuZGVyZXIueHIuZW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnJlbmRlckNhcHR1cmUoc2lkZSk7XG4gICAgICAgIC8vIFRyaWdnZXIgZmlsZSBkb3dubG9hZC5cbiAgICAgICAgdGhpcy5zYXZlQ2FwdHVyZShzbHVnLCBzaWRlKTtcbiAgICAgICAgLy8gUmVzdG9yZSBWUi5cbiAgICAgICAgLy9yZW5kZXJlci54ci5lbmFibGVkID0gaXNWUkVuYWJsZWQ7XG4gICAgIH1cblxuICAgIHJlbmRlckNhcHR1cmUgKGN1YmVTaWRlKSB7XG4gICAgICAgIHZhciBpbWFnZURhdGE7XG4gICAgICAgIHZhciBwaXhlbHMzID0gbmV3IFVpbnQ4QXJyYXkoNCAqIFRBUkdFVFdJRFRIICogVEFSR0VUSEVJR0hUKTtcbiAgICAgICAgdmFyIHJlbmRlcmVyID0gd2luZG93LkFQUC5zY2VuZS5yZW5kZXJlcjtcblxuICAgICAgICByZW5kZXJlci5yZWFkUmVuZGVyVGFyZ2V0UGl4ZWxzKHRoaXMucmVuZGVyVGFyZ2V0LCAwLCAwLCBUQVJHRVRXSURUSCxUQVJHRVRIRUlHSFQsIHBpeGVsczMsIGN1YmVTaWRlKTtcblxuICAgICAgICAvL3BpeGVsczMgPSB0aGlzLmZsaXBQaXhlbHNWZXJ0aWNhbGx5KHBpeGVsczMsIFRBUkdFVFdJRFRILCBUQVJHRVRIRUlHSFQpO1xuICAgICAgICB2YXIgcGl4ZWxzNCA9IHBpeGVsczM7ICAvL3RoaXMuY29udmVydDN0bzQocGl4ZWxzMywgVEFSR0VUV0lEVEgsIFRBUkdFVEhFSUdIVCk7XG4gICAgICAgIGltYWdlRGF0YSA9IG5ldyBJbWFnZURhdGEobmV3IFVpbnQ4Q2xhbXBlZEFycmF5KHBpeGVsczQpLCBUQVJHRVRXSURUSCwgVEFSR0VUSEVJR0hUKTtcblxuICAgICAgICAvLyBDb3B5IHBpeGVscyBpbnRvIGNhbnZhcy5cblxuICAgICAgICAvLyBjb3VsZCB1c2UgZHJhd0ltYWdlIGluc3RlYWQsIHRvIHNjYWxlLCBpZiB3ZSB3YW50XG4gICAgICAgIHRoaXMuY3R4LnB1dEltYWdlRGF0YShpbWFnZURhdGEsIDAsIDApO1xuICAgIH1cblxuICAgIGZsaXBQaXhlbHNWZXJ0aWNhbGx5IChwaXhlbHMsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgdmFyIGZsaXBwZWRQaXhlbHMgPSBwaXhlbHMuc2xpY2UoMCk7XG4gICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgd2lkdGg7ICsreCkge1xuICAgICAgICAgIGZvciAodmFyIHkgPSAwOyB5IDwgaGVpZ2h0OyArK3kpIHtcbiAgICAgICAgICAgIGZsaXBwZWRQaXhlbHNbeCAqIDMgKyB5ICogd2lkdGggKiAzXSA9IHBpeGVsc1t4ICogMyArIChoZWlnaHQgLSB5IC0gMSkgKiB3aWR0aCAqIDNdO1xuICAgICAgICAgICAgZmxpcHBlZFBpeGVsc1t4ICogMyArIDEgKyB5ICogd2lkdGggKiAzXSA9IHBpeGVsc1t4ICogMyArIDEgKyAoaGVpZ2h0IC0geSAtIDEpICogd2lkdGggKiAzXTtcbiAgICAgICAgICAgIGZsaXBwZWRQaXhlbHNbeCAqIDMgKyAyICsgeSAqIHdpZHRoICogM10gPSBwaXhlbHNbeCAqIDMgKyAyICsgKGhlaWdodCAtIHkgLSAxKSAqIHdpZHRoICogM107XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmbGlwcGVkUGl4ZWxzO1xuICAgIH1cblxuICAgIGNvbnZlcnQzdG80IChwaXhlbHMsIHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgdmFyIG5ld1BpeGVscyA9IG5ldyBVaW50OEFycmF5KDQgKiBUQVJHRVRXSURUSCAqIFRBUkdFVEhFSUdIVCk7XG5cbiAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCB3aWR0aDsgKyt4KSB7XG4gICAgICAgICAgZm9yICh2YXIgeSA9IDA7IHkgPCBoZWlnaHQ7ICsreSkge1xuICAgICAgICAgICAgbmV3UGl4ZWxzW3ggKiA0ICsgeSAqIHdpZHRoICogNF0gPSBwaXhlbHNbeCAqIDMgKyB5ICogd2lkdGggKiAzXTtcbiAgICAgICAgICAgIG5ld1BpeGVsc1t4ICogNCArIDEgKyB5ICogd2lkdGggKiA0XSA9IHBpeGVsc1t4ICogMyArIDEgKyB5ICogd2lkdGggKiAzXTtcbiAgICAgICAgICAgIG5ld1BpeGVsc1t4ICogNCArIDIgKyB5ICogd2lkdGggKiA0XSA9IHBpeGVsc1t4ICogMyArIDIgKyB5ICogd2lkdGggKiAzXTtcbiAgICAgICAgICAgIG5ld1BpeGVsc1t4ICogNCArIDMgKyB5ICogd2lkdGggKiA0XSA9IDI1NTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ld1BpeGVscztcbiAgICB9XG5cblxuICAgIHNpZGVzID0gW1xuICAgICAgICBcIlJpZ2h0XCIsIFwiTGVmdFwiLCBcIlRvcFwiLCBcIkJvdHRvbVwiLCBcIkZyb250XCIsIFwiQmFja1wiXG4gICAgXVxuXG4gICAgc2F2ZUNhcHR1cmUgKHNsdWcsIHNpZGUpIHtcbiAgICAgICAgdGhpcy5jYW52YXMudG9CbG9iKCAoYmxvYikgPT4ge1xuICAgICAgICAgICAgdmFyIGZpbGVOYW1lID0gc2x1ZyArICctJyArIHRoaXMuc2lkZXNbc2lkZV0gKyAnLnBuZyc7XG4gICAgICAgICAgICB2YXIgbGlua0VsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICAgICAgdmFyIHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgICAgICBsaW5rRWwuaHJlZiA9IHVybDtcbiAgICAgICAgICAgIGxpbmtFbC5zZXRBdHRyaWJ1dGUoJ2Rvd25sb2FkJywgZmlsZU5hbWUpO1xuICAgICAgICAgICAgbGlua0VsLmlubmVySFRNTCA9ICdkb3dubG9hZGluZy4uLic7XG4gICAgICAgICAgICBsaW5rRWwuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobGlua0VsKTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGxpbmtFbC5jbGljaygpO1xuICAgICAgICAgICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQobGlua0VsKTtcbiAgICAgICAgICAgIH0sIDEpO1xuICAgICAgICB9LCAnaW1hZ2UvcG5nJyk7XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBDdWJlQ2FtZXJhV3JpdGVyIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIEJpZGlyZWN0aW9uYWwgc2VlLXRocm91Z2ggcG9ydGFsLiBUd28gcG9ydGFscyBhcmUgcGFpcmVkIGJ5IGNvbG9yLlxuICpcbiAqIFVzYWdlXG4gKiA9PT09PT09XG4gKiBBZGQgdHdvIGluc3RhbmNlcyBvZiBgcG9ydGFsLmdsYmAgdG8gdGhlIFNwb2tlIHNjZW5lLlxuICogVGhlIG5hbWUgb2YgZWFjaCBpbnN0YW5jZSBzaG91bGQgbG9vayBsaWtlIFwic29tZS1kZXNjcmlwdGl2ZS1sYWJlbF9fY29sb3JcIlxuICogQW55IHZhbGlkIFRIUkVFLkNvbG9yIGFyZ3VtZW50IGlzIGEgdmFsaWQgY29sb3IgdmFsdWUuXG4gKiBTZWUgaGVyZSBmb3IgZXhhbXBsZSBjb2xvciBuYW1lcyBodHRwczovL3d3dy53M3NjaG9vbHMuY29tL2Nzc3JlZi9jc3NfY29sb3JzLmFzcFxuICpcbiAqIEZvciBleGFtcGxlLCB0byBtYWtlIGEgcGFpciBvZiBjb25uZWN0ZWQgYmx1ZSBwb3J0YWxzLFxuICogeW91IGNvdWxkIG5hbWUgdGhlbSBcInBvcnRhbC10b19fYmx1ZVwiIGFuZCBcInBvcnRhbC1mcm9tX19ibHVlXCJcbiAqL1xuaW1wb3J0IHt2dWVDb21wb25lbnRzIGFzIGh0bWxDb21wb25lbnRzfSBmcm9tIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCI7XG4vLyAgaW1wb3J0IFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCI7XG4vLyBsZXQgaHRtbENvbXBvbmVudHMgPSB3aW5kb3cuQVBQLnZ1ZUFwcHNcblxuaW1wb3J0ICcuL3Byb3hpbWl0eS1ldmVudHMuanMnXG4vLyBpbXBvcnQgdmVydGV4U2hhZGVyIGZyb20gJy4uL3NoYWRlcnMvcG9ydGFsLnZlcnQuanMnXG4vLyBpbXBvcnQgZnJhZ21lbnRTaGFkZXIgZnJvbSAnLi4vc2hhZGVycy9wb3J0YWwuZnJhZy5qcydcbi8vIGltcG9ydCBzbm9pc2UgZnJvbSAnLi4vc2hhZGVycy9zbm9pc2UnXG5cbmltcG9ydCB7IHNob3dSZWdpb25Gb3JPYmplY3QsIGhpZGVyUmVnaW9uRm9yT2JqZWN0IH0gZnJvbSAnLi9yZWdpb24taGlkZXIuanMnXG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSAnLi4vdXRpbHMvc2NlbmUtZ3JhcGgnXG5pbXBvcnQgeyB1cGRhdGVXaXRoU2hhZGVyIH0gZnJvbSAnLi9zaGFkZXInXG5pbXBvcnQgeyBXYXJwUG9ydGFsU2hhZGVyIH0gZnJvbSAnLi4vc2hhZGVycy93YXJwLXBvcnRhbC5qcydcbmltcG9ydCB7IGRvd25sb2FkQmxvYiAgfSBmcm9tIFwiLi4vdXRpbHMvdXRpbHNcIjtcblxuaW1wb3J0IGdvbGRjb2xvciBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9DT0xPUi5qcGcnXG5pbXBvcnQgZ29sZERpc3BsYWNlbWVudCBmcm9tICcuLi9hc3NldHMvTWV0YWxfR29sZF9Gb2lsXzAwMl9ESVNQLmpwZydcbmltcG9ydCBnb2xkZ2xvc3MgZnJvbSAnLi4vYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfZ2xvc3NpbmVzcy5wbmcnXG5pbXBvcnQgZ29sZG5vcm0gZnJvbSAnLi4vYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfTlJNLmpwZydcbmltcG9ydCBnb2xkYW8gZnJvbSAnLi4vYXNzZXRzL01ldGFsX0dvbGRfRm9pbF8wMDJfT0NDLmpwZydcblxuaW1wb3J0IEN1YmVDYW1lcmFXcml0ZXIgZnJvbSBcIi4uL3V0aWxzL3dyaXRlQ3ViZU1hcC5qc1wiO1xuXG5pbXBvcnQgeyByZXBsYWNlTWF0ZXJpYWwgYXMgcmVwbGFjZVdpdGhTaGFkZXJ9IGZyb20gJy4vc2hhZGVyJ1xuaW1wb3J0IHsgTWF0cml4NCB9IGZyb20gXCJ0aHJlZVwiO1xuXG5jb25zdCB3b3JsZFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkQ2FtZXJhUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3Qgd29ybGREaXIgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCB3b3JsZFF1YXQgPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpXG5jb25zdCBtYXQ0ID0gbmV3IFRIUkVFLk1hdHJpeDQoKVxuXG4vLyBsb2FkIGFuZCBzZXR1cCBhbGwgdGhlIGJpdHMgb2YgdGhlIHRleHR1cmVzIGZvciB0aGUgZG9vclxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxuY29uc3QgZG9vck1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHtcbiAgICBjb2xvcjogMHhmZmZmZmYsXG4gICAgbWV0YWxuZXNzOiAwLjAsXG4gICAgcm91Z2huZXNzOiAwLjAsIFxuICAgIC8vZW1pc3NpdmVJbnRlbnNpdHk6IDFcbn0pXG5jb25zdCBkb29ybWF0ZXJpYWxZID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHtcbiAgICBjb2xvcjogMHhmZmZmZmYsXG4gICAgbWV0YWxuZXNzOiAwLjAsXG4gICAgcm91Z2huZXNzOiAwLCBcbiAgICAvL2VtaXNzaXZlSW50ZW5zaXR5OiAxXG59KVxuXG5sb2FkZXIubG9hZChnb2xkY29sb3IsIChjb2xvcikgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5tYXAgPSBjb2xvcjtcbiAgICBjb2xvci5yZXBlYXQuc2V0KDEsMjUpXG4gICAgY29sb3Iud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBjb2xvci53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRvb3JNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5sb2FkZXIubG9hZChnb2xkY29sb3IsIChjb2xvcikgPT4ge1xuICAgIC8vY29sb3IgPSBjb2xvci5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5tYXAgPSBjb2xvcjtcbiAgICBjb2xvci5yZXBlYXQuc2V0KDEsMSlcbiAgICBjb2xvci53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgY29sb3Iud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkRGlzcGxhY2VtZW50LCAoZGlzcCkgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5idW1wTWFwID0gZGlzcDtcbiAgICBkaXNwLnJlcGVhdC5zZXQoMSwyNSlcbiAgICBkaXNwLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZGlzcC53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGRvb3JNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGREaXNwbGFjZW1lbnQsIChkaXNwKSA9PiB7XG4gICAgLy9kaXNwID0gZGlzcC5jbG9uZSgpXG4gICAgZG9vcm1hdGVyaWFsWS5idW1wTWFwID0gZGlzcDtcbiAgICBkaXNwLnJlcGVhdC5zZXQoMSwxKVxuICAgIGRpc3Aud3JhcFMgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRpc3Aud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG5sb2FkZXIubG9hZChnb2xkZ2xvc3MsIChnbG9zcykgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5yb3VnaG5lc3MgPSBnbG9zc1xuICAgIGdsb3NzLnJlcGVhdC5zZXQoMSwyNSlcbiAgICBnbG9zcy53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGdsb3NzLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZGdsb3NzLCAoZ2xvc3MpID0+IHtcbiAgICAvL2dsb3NzID0gZ2xvc3MuY2xvbmUoKVxuICAgIGRvb3JtYXRlcmlhbFkucm91Z2huZXNzID0gZ2xvc3NcbiAgICBnbG9zcy5yZXBlYXQuc2V0KDEsMSlcbiAgICBnbG9zcy53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZ2xvc3Mud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuICAgICAgICAgXG5sb2FkZXIubG9hZChnb2xkYW8sIChhbykgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5hb01hcCA9IGFvXG4gICAgYW8ucmVwZWF0LnNldCgxLDI1KVxuICAgIGFvLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYW8ud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBkb29yTWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuICAgICAgICAgXG5sb2FkZXIubG9hZChnb2xkYW8sIChhbykgPT4ge1xuICAgIC8vIGFvID0gYW8uY2xvbmUoKVxuICAgIGRvb3JtYXRlcmlhbFkuYW9NYXAgPSBhb1xuICAgIGFvLnJlcGVhdC5zZXQoMSwxKVxuICAgIGFvLndyYXBTID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcbiAgICBhby53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XG4gICAgZG9vcm1hdGVyaWFsWS5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbmxvYWRlci5sb2FkKGdvbGRub3JtLCAobm9ybSkgPT4ge1xuICAgIGRvb3JNYXRlcmlhbC5ub3JtYWxNYXAgPSBub3JtO1xuICAgIG5vcm0ucmVwZWF0LnNldCgxLDI1KVxuICAgIG5vcm0ud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcbiAgICBub3JtLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgZG9vck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZVxufSlcblxubG9hZGVyLmxvYWQoZ29sZG5vcm0sIChub3JtKSA9PiB7XG4gICAgLy8gbm9ybSA9IG5vcm0uY2xvbmUoKVxuICAgIGRvb3JtYXRlcmlhbFkubm9ybWFsTWFwID0gbm9ybTtcbiAgICBub3JtLnJlcGVhdC5zZXQoMSwxKVxuICAgIG5vcm0ud3JhcFMgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIG5vcm0ud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nO1xuICAgIGRvb3JtYXRlcmlhbFkubmVlZHNVcGRhdGUgPSB0cnVlXG59KVxuXG4vLyAvLyBtYXAgYWxsIG1hdGVyaWFscyB2aWEgYSBjYWxsYmFjay4gIFRha2VuIGZyb20gaHVicyBtYXRlcmlhbHMtdXRpbHNcbi8vIGZ1bmN0aW9uIG1hcE1hdGVyaWFscyhvYmplY3QzRCwgZm4pIHtcbi8vICAgICBsZXQgbWVzaCA9IG9iamVjdDNEIFxuLy8gICAgIGlmICghbWVzaC5tYXRlcmlhbCkgcmV0dXJuO1xuICBcbi8vICAgICBpZiAoQXJyYXkuaXNBcnJheShtZXNoLm1hdGVyaWFsKSkge1xuLy8gICAgICAgcmV0dXJuIG1lc2gubWF0ZXJpYWwubWFwKGZuKTtcbi8vICAgICB9IGVsc2Uge1xuLy8gICAgICAgcmV0dXJuIGZuKG1lc2gubWF0ZXJpYWwpO1xuLy8gICAgIH1cbi8vIH1cbiAgXG5jb25zdCB3YWl0Rm9yRXZlbnQgPSBmdW5jdGlvbihldmVudE5hbWUsIGV2ZW50T2JqKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgZXZlbnRPYmouYWRkRXZlbnRMaXN0ZW5lcihldmVudE5hbWUsIHJlc29sdmUsIHsgb25jZTogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgfTtcbiAgXG5jb25zdCB3YWl0Rm9yRE9NQ29udGVudExvYWRlZCA9IGZ1bmN0aW9uKCkge1xuICAgIGlmIChkb2N1bWVudC5yZWFkeVN0YXRlID09PSBcImNvbXBsZXRlXCIgfHwgZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gXCJsb2FkZWRcIiB8fCBkb2N1bWVudC5yZWFkeVN0YXRlID09PSBcImludGVyYWN0aXZlXCIpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gd2FpdEZvckV2ZW50KFwiRE9NQ29udGVudExvYWRlZFwiLCB3aW5kb3cpO1xuICAgIH1cbn07XG4gIFxuICBcblxuLy8gIHNjZW5lLmVtaXQoXCJodWJfdXBkYXRlZFwiLCB7IGh1YiB9KTtcblxuY29uc3Qgb25jZSA9IHtcbiAgICBvbmNlIDogdHJ1ZVxufTtcblxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdwb3J0YWwnLCB7XG4gIGRlcGVuZGVuY2llczogWydmYWRlci1wbHVzJ10sXG4gIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gZmFsc2VcbiAgICB0aGlzLmNoYXJhY3RlckNvbnRyb2xsZXIgPSB0aGlzLmVsLnN5c3RlbXNbJ2h1YnMtc3lzdGVtcyddLmNoYXJhY3RlckNvbnRyb2xsZXJcbiAgICB0aGlzLmZhZGVyID0gdGhpcy5lbC5zeXN0ZW1zWydmYWRlci1wbHVzJ11cbiAgICB0aGlzLnJvb21EYXRhID0gbnVsbDtcbiAgICB0aGlzLmNhY2hlTG9hZGVkID0gZmFsc2U7XG5cbiAgICB3YWl0Rm9yRE9NQ29udGVudExvYWRlZCgpLnRoZW4oKCkgPT4ge1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIC8vIHdhbnQgdG8gbGV0IG90aGVyIGRvbWNvbnRlbnRsb2FkZWQgZXZlbnRzIHRvIGZpbmlzaFxuICAgICAgICAgICAgLy8gYmVmb3JlIHdlIHJ1biwgc28gU1NPIGlzIHNldCB1cCAoaWYgaXQgd2lsbCBiZSlcbiAgICAgICAgICAgIHRoaXMuZmV0Y2hSb29tRGF0YSgpXG4gICAgICAgIH0sMSk7XG4gICAgfSk7XG4gIH0sXG5cbiAgZmV0Y2hSb29tRGF0YTogYXN5bmMgZnVuY3Rpb24gKCkgeyAgXG4gICAgdGhpcy5sb2FkTGF5ZXJDYWNoZSgpXG5cbiAgICAvLyBpZiB3ZSBhcmUgcnVubmluZyBvbiByZWFsaXR5bWVkaWEuZGlnaXRhbCwgdGhpcyB3aWxsIGJlIHNldC4gIElGIHdlIGFyZSBub3QsXG4gICAgLy8gaXQgd29uJ3QgYmUgc2V0LCBzbyBqdXN0IGJhY2sgb3V0XG4gICAgaWYgKCF3aW5kb3cuU1NPKSB7XG4gICAgICAgIHRoaXMucm9vbURhdGEgPSB7XG4gICAgICAgICAgICByb29tSWQ6IC0xLFxuICAgICAgICAgICAgbG9jYWxSb29tczogW11cbiAgICAgICAgfVxuICAgICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLndhaXRGb3JGZXRjaCgpXG4gICAgbGV0IGh1YklkID0gd2luZG93LkFQUC5odWJDaGFubmVsLmh1YklkO1xuICAgIGxldCBmb3VuZCA9IGZhbHNlO1xuICAgIGZvdW5kID0gd2luZG93LlNTTy51c2VySW5mby5yb29tcy5maW5kKChlbCwgaW5kZXgpID0+IHtcbiAgICAgICAgaWYgKGVsID09IGh1YklkKSB7XG4gICAgICAgICAgICB0aGlzLnJvb21EYXRhID0ge1xuICAgICAgICAgICAgICAgIHJvb21JZDogaW5kZXgsXG4gICAgICAgICAgICAgICAgbG9jYWxSb29tczogW11cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBcbiAgICB9KVxuXG4gICAgaWYgKCFmb3VuZCkge1xuICAgICAgICBjb25zdCBvcHRpb25zID0ge307XG4gICAgICAgIG9wdGlvbnMuaGVhZGVycyA9IG5ldyBIZWFkZXJzKCk7XG4gICAgICAgIC8vb3B0aW9ucy5oZWFkZXJzLnNldChcIkF1dGhvcml6YXRpb25cIiwgYEJlYXJlciAke3BhcmFtc31gKTtcbiAgICAgICAgb3B0aW9ucy5oZWFkZXJzLnNldChcIkNvbnRlbnQtVHlwZVwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG4gICAgICAgIG9wdGlvbnMuY3JlZGVudGlhbHMgPSBcImluY2x1ZGVcIiwgLy8gdXNlIGNvb2tpZVxuICAgICAgICBhd2FpdCBmZXRjaChcImh0dHBzOi8vcmVhbGl0eW1lZGlhLmRpZ2l0YWwvc3NvL3VzZXJSb29tcy8/ZW1haWw9XCIgKyBcbiAgICAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudCh3aW5kb3cuQVBQLnN0b3JlLnN0YXRlLmNyZWRlbnRpYWxzLmVtYWlsKSArIFwiJnRva2VuPVwiICsgXG4gICAgICAgICAgICBlbmNvZGVVUklDb21wb25lbnQod2luZG93LkFQUC5zdG9yZS5zdGF0ZS5jcmVkZW50aWFscy50b2tlbikgKyBcIiZodWJJZD1cIiArXG4gICAgICAgICAgICBlbmNvZGVVUklDb21wb25lbnQoaHViSWQpLCBvcHRpb25zKVxuICAgICAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuanNvbigpKVxuICAgICAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZldGNoIFJvb20gRGF0YSBTdWNjZXNzOicsIGRhdGEpO1xuICAgICAgICAgICAgICAgIHRoaXMucm9vbURhdGEgPSBkYXRhO1xuICAgICAgICB9KVxuICAgIH1cbiAgfSxcblxuICBsb2FkTGF5ZXJDYWNoZTogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIGxldCByb29tVXJpID0gYXdhaXQgdGhpcy5nZXRDYWNoZVVSSSgpO1xuICAgIGxldCB1cmwgPSBcImh0dHBzOi8vcmVzb3VyY2VzLnJlYWxpdHltZWRpYS5kaWdpdGFsL2RhdGEvcm9vbUNhY2hlL1wiICsgcm9vbVVyaTtcbiAgICBjb25zdCBsb2FkQ2FjaGUgPSBodG1sQ29tcG9uZW50c1tcImxvYWRDYWNoZVwiXTtcbiAgICAvLyBhd2FpdCBsb2FkQ2FjaGUodXJsKTtcbiAgICB0aGlzLmNhY2hlTG9hZGVkID0gdHJ1ZVxuICB9LFxuXG4gIHdhaXRGb3JDYWNoZTogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgIGxldCB3YWl0Rm9ySXQgPSAoKSA9PiB7XG4gICAgICAgICAgIGlmICh0aGlzLmNhY2hlTG9hZGVkKSB7XG4gICAgICAgICAgICAgICByZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICB9XG4gICAgICAgICAgIHNldFRpbWVvdXQod2FpdEZvckl0LCAxMCk7IC8vIHRyeSBhZ2FpbiBpbiAxMDAgbWlsbGlzZWNvbmRzICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgd2FpdEZvckl0KClcbiAgICB9KVxuICB9LFxuXG4gIHdhaXRGb3JGZXRjaDogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgIGxldCB3YWl0Rm9ySXQgPSAoKSA9PiB7XG4gICAgICAgICAgIGlmICh3aW5kb3cuU1NPICYmIHdpbmRvdy5TU08udXNlckluZm8pIHtcbiAgICAgICAgICAgICAgIHJlc29sdmUodHJ1ZSk7XG4gICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgIH1cbiAgICAgICAgICAgc2V0VGltZW91dCh3YWl0Rm9ySXQsIDEwKTsgLy8gdHJ5IGFnYWluIGluIDEwMCBtaWxsaXNlY29uZHMgICAgICAgICAgICBcbiAgICAgICAgfVxuICAgICAgICB3YWl0Rm9ySXQoKVxuICAgIH0pXG4gIH0sXG5cbiAgd2FpdEZvclJvb21JZDogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgIGxldCB3YWl0Rm9ySXQgPSAoKSA9PiB7XG4gICAgICAgICAgIGlmICh0aGlzLnJvb21EYXRhKSB7XG4gICAgICAgICAgICAgICByZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICB9XG4gICAgICAgICAgIHNldFRpbWVvdXQod2FpdEZvckl0LCAxMCk7IC8vIHRyeSBhZ2FpbiBpbiAxMDAgbWlsbGlzZWNvbmRzICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICAgICAgd2FpdEZvckl0KClcbiAgICB9KVxuICB9LFxuXG4gIGdldENhY2hlVVJJOiBhc3luYyBmdW5jdGlvbigpIHtcbiAgICBhd2FpdCB0aGlzLndhaXRGb3JSb29tSWQoKVxuICAgIFxuICAgIGxldCByb29tSWQgPSB0aGlzLnJvb21EYXRhLnJvb21JZFxuXG4gICAgbGV0IHJvb20gPSByb29tSWQudG9TdHJpbmcoKTtcbiAgICBpZiAocm9vbUlkIDwgMCkge1xuICAgICAgICByb29tID0gd2luZG93LkFQUC5odWJDaGFubmVsLmh1YklkO1xuICAgIH1cbiAgICByZXR1cm4gcm9vbSArICcuY2FjaGUnO1xuICB9LFxuXG4gIGdldFJvb21VUkw6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICBsZXQgaHViX2lkID0gYXdhaXQgdGhpcy5nZXRSb29tSHViSWQobnVtYmVyKVxuXG4gICAgaWYgKG51bWJlciA+PSAwICYmIHdpbmRvdy5TU08udXNlckluZm8ucm9vbXMubGVuZ3RoID4gbnVtYmVyKSB7XG4gICAgICAgICAgcmV0dXJuIFwiaHR0cHM6Ly94ci5yZWFsaXR5bWVkaWEuZGlnaXRhbC9cIiArIGh1Yl9pZFxuICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgfVxuICB9LFxuICBnZXRSb29tSHViSWQ6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIpIHtcbiAgICAvLyBuZWVkIGJvdGggdGhlIGxvZ2luIGluZm8gd2hpY2ggaGFzIHRoZSBsb2NhbCByb29tIGxpc3RcbiAgICAvLyBhbmQgdGhlIHJvb20gbGlzdCBmZXRjaGVkIGZyb20gdGhlIHNlcnZlclxuICAgIGF3YWl0IHRoaXMud2FpdEZvckZldGNoKCk7XG4gICAgYXdhaXQgdGhpcy53YWl0Rm9yUm9vbUlkKCk7XG5cbiAgICBpZiAobnVtYmVyID49IDAgJiYgd2luZG93LlNTTy51c2VySW5mby5yb29tcy5sZW5ndGggPiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRoaXMucm9vbURhdGEucm9vbUlkID4gMCAmJiB0aGlzLnJvb21EYXRhLmxvY2FsUm9vbXMubGVuZ3RoID4gbnVtYmVyKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5yb29tRGF0YS5sb2NhbFJvb21zW251bWJlcl07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gd2luZG93LlNTTy51c2VySW5mby5yb29tc1tudW1iZXJdO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIFwiXCJcbiAgICB9XG4gIH0sXG4gIGdldEN1YmVNYXA6IGFzeW5jIGZ1bmN0aW9uIChudW1iZXIsIHdheXBvaW50KSB7XG4gICAgICBhd2FpdCB0aGlzLndhaXRGb3JGZXRjaCgpXG5cbiAgICAgIGlmICghd2F5cG9pbnQgfHwgd2F5cG9pbnQubGVuZ3RoID09IDApIHtcbiAgICAgICAgICB3YXlwb2ludCA9IFwic3RhcnRcIlxuICAgICAgfVxuICAgICAgbGV0IHVybHMgPSBbXCJSaWdodFwiLFwiTGVmdFwiLFwiVG9wXCIsXCJCb3R0b21cIixcIkZyb250XCIsXCJCYWNrXCJdLm1hcChlbCA9PiB7XG4gICAgICAgICAgcmV0dXJuIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvZGF0YS9yb29tUGFub3MvXCIgKyBudW1iZXIudG9TdHJpbmcoKSArIFwiL1wiICsgd2F5cG9pbnQgKyBcIi1cIiArIGVsICsgXCIucG5nXCJcbiAgICAgIH0pXG4gICAgICByZXR1cm4gdXJsc1xuICAgICAgLy9yZXR1cm4gdGhpcy5yb29tRGF0YS5jdWJlbWFwcy5sZW5ndGggPiBudW1iZXIgPyB0aGlzLnJvb21EYXRhLmN1YmVtYXBzW251bWJlcl0gOiBudWxsO1xuICB9LFxuICBnZXRDdWJlTWFwQnlOYW1lOiBhc3luYyBmdW5jdGlvbiAobmFtZSwgd2F5cG9pbnQpIHtcbiAgICBpZiAoIXdheXBvaW50IHx8IHdheXBvaW50Lmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHdheXBvaW50ID0gXCJzdGFydFwiXG4gICAgfVxuICAgIGxldCB1cmxzID0gW1wiUmlnaHRcIixcIkxlZnRcIixcIlRvcFwiLFwiQm90dG9tXCIsXCJGcm9udFwiLFwiQmFja1wiXS5tYXAoZWwgPT4ge1xuICAgICAgICByZXR1cm4gXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9kYXRhL3Jvb21QYW5vcy9cIiArIG5hbWUgKyBcIi9cIiArIHdheXBvaW50ICsgXCItXCIgKyBlbCArIFwiLnBuZ1wiXG4gICAgfSlcbiAgICByZXR1cm4gdXJsc1xuICAgIC8vcmV0dXJuIHRoaXMucm9vbURhdGEuY3ViZW1hcHMubGVuZ3RoID4gbnVtYmVyID8gdGhpcy5yb29tRGF0YS5jdWJlbWFwc1tudW1iZXJdIDogbnVsbDtcbiAgfSxcblxuICBnb1RvVVJMOiBhc3luYyBmdW5jdGlvbiAodXJsKSB7XG4gICAgLy8gZmlyc3QgZmFkZSBvdXRcbiAgICBhd2FpdCB0aGlzLmZhZGVyLmZhZGVPdXQoKTtcbiBcbiAgICAvLyB0aGVuIGhpZGUgY29tcGxldGVseVxuICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIuYS1jYW52YXNcIik7XG4gICAgY2FudmFzLmNsYXNzTGlzdC5hZGQoXCJhLWhpZGRlblwiKTtcblxuICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gdXJsO1xuICB9LFxuXG4gIHRlbGVwb3J0VG86IGFzeW5jIGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICB0aGlzLnRlbGVwb3J0aW5nID0gdHJ1ZVxuICAgIGF3YWl0IHRoaXMuZmFkZXIuZmFkZU91dCgpXG4gICAgLy8gU2NhbGUgc2NyZXdzIHVwIHRoZSB3YXlwb2ludCBsb2dpYywgc28ganVzdCBzZW5kIHBvc2l0aW9uIGFuZCBvcmllbnRhdGlvblxuICAgIG9iamVjdC5nZXRXb3JsZFF1YXRlcm5pb24od29ybGRRdWF0KVxuICAgIG9iamVjdC5nZXRXb3JsZERpcmVjdGlvbih3b3JsZERpcilcbiAgICBvYmplY3QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFBvcylcbiAgICB3b3JsZFBvcy5hZGQod29ybGREaXIubXVsdGlwbHlTY2FsYXIoMykpIC8vIFRlbGVwb3J0IGluIGZyb250IG9mIHRoZSBwb3J0YWwgdG8gYXZvaWQgaW5maW5pdGUgbG9vcFxuICAgIG1hdDQubWFrZVJvdGF0aW9uRnJvbVF1YXRlcm5pb24od29ybGRRdWF0KVxuICAgIG1hdDQuc2V0UG9zaXRpb24od29ybGRQb3MpXG4gICAgLy8gVXNpbmcgdGhlIGNoYXJhY3RlckNvbnRyb2xsZXIgZW5zdXJlcyB3ZSBkb24ndCBzdHJheSBmcm9tIHRoZSBuYXZtZXNoXG4gICAgdGhpcy5jaGFyYWN0ZXJDb250cm9sbGVyLnRyYXZlbEJ5V2F5cG9pbnQobWF0NCwgdHJ1ZSwgZmFsc2UpXG4gICAgYXdhaXQgdGhpcy5mYWRlci5mYWRlSW4oKVxuICAgIHRoaXMudGVsZXBvcnRpbmcgPSBmYWxzZVxuICB9LFxufSlcblxud2luZG93LkFQUC5zYXZlTGF5ZXJDYWNoZSA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICBsZXQgc3lzdGVtID0gd2luZG93LkFQUC5zY2VuZS5zeXN0ZW1zLnBvcnRhbDtcbiAgICBsZXQgcm9vbVVyaSA9IGF3YWl0IHN5c3RlbS5nZXRDYWNoZVVSSSgpO1xuXG4gICAgY29uc3QgZXhwb3J0Q2FjaGUgPSBodG1sQ29tcG9uZW50c1tcImV4cG9ydENhY2hlXCJdO1xuICAgIGxldCBibG9iID0gYXdhaXQgZXhwb3J0Q2FjaGUoKTtcbiAgICBkb3dubG9hZEJsb2IoYmxvYiwgcm9vbVVyaSk7XG59XG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgncG9ydGFsJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICBwb3J0YWxUeXBlOiB7IGRlZmF1bHQ6IFwiXCIgfSxcbiAgICAgICAgcG9ydGFsVGFyZ2V0OiB7IGRlZmF1bHQ6IFwiXCIgfSxcbiAgICAgICAgc2Vjb25kYXJ5VGFyZ2V0OiB7IGRlZmF1bHQ6IFwiXCIgfSxcbiAgICAgICAgY29sb3I6IHsgdHlwZTogJ2NvbG9yJywgZGVmYXVsdDogbnVsbCB9LFxuICAgICAgICBtYXRlcmlhbFRhcmdldDogeyB0eXBlOiAnc3RyaW5nJywgZGVmYXVsdDogbnVsbCB9LFxuICAgICAgICBkcmF3RG9vcjogeyB0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IGZhbHNlIH0sXG4gICAgICAgIHRleHQ6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IG51bGx9LFxuICAgICAgICB0ZXh0UG9zaXRpb246IHsgdHlwZTogJ3ZlYzMnIH0sXG4gICAgICAgIHRleHRTaXplOiB7IHR5cGU6ICd2ZWMyJyB9LFxuICAgICAgICB0ZXh0U2NhbGU6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDEgfVxuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIFRFU1RJTkdcbiAgICAgICAgLy90aGlzLmRhdGEuZHJhd0Rvb3IgPSB0cnVlXG4gICAgICAgIC8vIHRoaXMuZGF0YS5tYWluVGV4dCA9IFwiUG9ydGFsIHRvIHRoZSBBYnlzc1wiXG4gICAgICAgIC8vIHRoaXMuZGF0YS5zZWNvbmRhcnlUZXh0ID0gXCJUbyB2aXNpdCB0aGUgQWJ5c3MsIGdvIHRocm91Z2ggdGhlIGRvb3IhXCJcblxuICAgICAgICAvLyBBLUZyYW1lIGlzIHN1cHBvc2VkIHRvIGRvIHRoaXMgYnkgZGVmYXVsdCBidXQgZG9lc24ndCBzZWVtIHRvP1xuICAgICAgICB0aGlzLnN5c3RlbSA9IHdpbmRvdy5BUFAuc2NlbmUuc3lzdGVtcy5wb3J0YWwgXG5cbiAgICAgICAgdGhpcy51cGRhdGVQb3J0YWwgPSB0aGlzLnVwZGF0ZVBvcnRhbC5iaW5kKHRoaXMpXG5cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5wb3J0YWxUeXBlLmxlbmd0aCA+IDAgKSB7XG4gICAgICAgICAgICB0aGlzLnNldFBvcnRhbEluZm8odGhpcy5kYXRhLnBvcnRhbFR5cGUsIHRoaXMuZGF0YS5wb3J0YWxUYXJnZXQsIHRoaXMuZGF0YS5jb2xvcilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDBcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMCkge1xuICAgICAgICAgICAgLy8gcGFyc2UgdGhlIG5hbWUgdG8gZ2V0IHBvcnRhbCB0eXBlLCB0YXJnZXQsIGFuZCBjb2xvclxuICAgICAgICAgICAgdGhpcy5wYXJzZU5vZGVOYW1lKClcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdGhpcy5wb3J0YWxUaXRsZSA9IG51bGw7XG5cbiAgICAgICAgLy8gd2FpdCB1bnRpbCB0aGUgc2NlbmUgbG9hZHMgdG8gZmluaXNoLiAgV2Ugd2FudCB0byBtYWtlIHN1cmUgZXZlcnl0aGluZ1xuICAgICAgICAvLyBpcyBpbml0aWFsaXplZFxuICAgICAgICBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbiAgICAgICAgcm9vdCAmJiByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgKGV2KSA9PiB7IFxuICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplKClcbiAgICAgICAgfSwgb25jZSk7XG4gICAgfSxcblxuICAgIGluaXRpYWxpemU6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gdGhpcy5tYXRlcmlhbCA9IG5ldyBUSFJFRS5TaGFkZXJNYXRlcmlhbCh7XG4gICAgICAgIC8vICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICAgIC8vICAgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcbiAgICAgICAgLy8gICB1bmlmb3Jtczoge1xuICAgICAgICAvLyAgICAgY3ViZU1hcDogeyB2YWx1ZTogbmV3IFRIUkVFLlRleHR1cmUoKSB9LFxuICAgICAgICAvLyAgICAgdGltZTogeyB2YWx1ZTogMCB9LFxuICAgICAgICAvLyAgICAgcmFkaXVzOiB7IHZhbHVlOiAwIH0sXG4gICAgICAgIC8vICAgICByaW5nQ29sb3I6IHsgdmFsdWU6IHRoaXMuY29sb3IgfSxcbiAgICAgICAgLy8gICB9LFxuICAgICAgICAvLyAgIHZlcnRleFNoYWRlcixcbiAgICAgICAgLy8gICBmcmFnbWVudFNoYWRlcjogYFxuICAgICAgICAvLyAgICAgJHtzbm9pc2V9XG4gICAgICAgIC8vICAgICAke2ZyYWdtZW50U2hhZGVyfVxuICAgICAgICAvLyAgIGAsXG4gICAgICAgIC8vIH0pXG5cbiAgICAgICAgLy8gQXNzdW1lIHRoYXQgdGhlIG9iamVjdCBoYXMgYSBwbGFuZSBnZW9tZXRyeVxuICAgICAgICAvL2NvbnN0IG1lc2ggPSB0aGlzLmVsLmdldE9yQ3JlYXRlT2JqZWN0M0QoJ21lc2gnKVxuICAgICAgICAvL21lc2gubWF0ZXJpYWwgPSB0aGlzLm1hdGVyaWFsXG5cbiAgICAgICAgdGhpcy5tYXRlcmlhbHMgPSBudWxsXG4gICAgICAgIHRoaXMucmFkaXVzID0gMC4yXG4gICAgICAgIHRoaXMuY3ViZU1hcCA9IG5ldyBUSFJFRS5DdWJlVGV4dHVyZSgpXG5cbiAgICAgICAgLy8gZ2V0IHRoZSBvdGhlciBiZWZvcmUgY29udGludWluZ1xuICAgICAgICB0aGlzLm90aGVyID0gYXdhaXQgdGhpcy5nZXRPdGhlcigpXG5cbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FuaW1hdGlvbl9fcG9ydGFsJywge1xuICAgICAgICAgICAgcHJvcGVydHk6ICdjb21wb25lbnRzLnBvcnRhbC5yYWRpdXMnLFxuICAgICAgICAgICAgZHVyOiA3MDAsXG4gICAgICAgICAgICBlYXNpbmc6ICdlYXNlSW5PdXRDdWJpYycsXG4gICAgICAgIH0pXG4gICAgICAgIFxuICAgICAgICAvLyB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2FuaW1hdGlvbmJlZ2luJywgKCkgPT4gKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSA9IHRydWUpKVxuICAgICAgICAvLyB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2FuaW1hdGlvbmNvbXBsZXRlX19wb3J0YWwnLCAoKSA9PiAodGhpcy5lbC5vYmplY3QzRC52aXNpYmxlID0gIXRoaXMuaXNDbG9zZWQoKSkpXG5cbiAgICAgICAgLy8gZ29pbmcgdG8gd2FudCB0byB0cnkgYW5kIG1ha2UgdGhlIG9iamVjdCB0aGlzIHBvcnRhbCBpcyBvbiBjbGlja2FibGVcbiAgICAgICAgLy8gdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2lzLXJlbW90ZS1ob3Zlci10YXJnZXQnLCcnKVxuICAgICAgICAvLyB0aGlzLmVsLnNldEF0dHJpYnV0ZSgndGFncycsIHtzaW5nbGVBY3Rpb25CdXR0b246IHRydWV9KVxuICAgICAgICAvL3RoaXMuZWwuc2V0QXR0cmlidXRlKCdjbGFzcycsIFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgICAgIC8vIG9yd2FyZCB0aGUgJ2ludGVyYWN0JyBldmVudHMgdG8gb3VyIHBvcnRhbCBtb3ZlbWVudCBcbiAgICAgICAgLy90aGlzLmZvbGxvd1BvcnRhbCA9IHRoaXMuZm9sbG93UG9ydGFsLmJpbmQodGhpcylcbiAgICAgICAgLy90aGlzLmVsLm9iamVjdDNELmFkZEV2ZW50TGlzdGVuZXIoJ2ludGVyYWN0JywgdGhpcy5mb2xsb3dQb3J0YWwpXG5cbiAgICAgICAgaWYgKCB0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0gfHwgdGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtaW1hZ2VcIl0gKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4gICAgICAgICAgICAgICAgbGV0IGZuID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwUG9ydGFsKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuZHJhd0Rvb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBEb29yKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5yZW1vdmVFdmVudExpc3RlbmVyKCdtZWRpYS1sb2FkZWQnLCBmbilcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCBmbilcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXR1cFBvcnRhbCgpXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5kcmF3RG9vcikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwRG9vcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2V0dXBQb3J0YWwoKVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5kcmF3RG9vcikge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBEb29yKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgdXBkYXRlUG9ydGFsOiBhc3luYyBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIG5vLW9wIGZvciBwb3J0YWxzIHRoYXQgdXNlIHByZS1yZW5kZXJlZCBjdWJlIG1hcHNcbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAyIHx8IHRoaXMucG9ydGFsVHlwZSA9PSAzKSB7IFxuICAgICAgICAgICAgLy90aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcignbW9kZWwtbG9hZGVkJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHNob3dSZWdpb25Gb3JPYmplY3QodGhpcy5lbClcbiAgICAgICAgICAgICAgICB0aGlzLmN1YmVDYW1lcmEudXBkYXRlKHRoaXMuZWwuc2NlbmVFbC5yZW5kZXJlciwgdGhpcy5lbC5zY2VuZUVsLm9iamVjdDNEKVxuICAgICAgICAgICAgICAgIC8vIHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSB0cnVlXG4gICAgICAgICAgICAgICAgLy8gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlLm5lZWRzVXBkYXRlID0gdHJ1ZVxuICAgICAgICAgICAgICAgIGhpZGVyUmVnaW9uRm9yT2JqZWN0KHRoaXMuZWwpXG4gICAgICAgICAgICAvL30sIG9uY2UpXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgc2V0dXBQb3J0YWw6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gZ2V0IHJpZCBvZiBpbnRlcmFjdGl2aXR5XG4gICAgICAgIGlmICh0aGlzLmVsLmNsYXNzTGlzdC5jb250YWlucyhcImludGVyYWN0YWJsZVwiKSkge1xuICAgICAgICAgICAgdGhpcy5lbC5jbGFzc0xpc3QucmVtb3ZlKFwiaW50ZXJhY3RhYmxlXCIpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lbC5yZW1vdmVBdHRyaWJ1dGUoXCJpcy1yZW1vdGUtaG92ZXItdGFyZ2V0XCIpXG4gICAgICAgIFxuICAgICAgICBsZXQgdGFyZ2V0ID0gdGhpcy5kYXRhLm1hdGVyaWFsVGFyZ2V0XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGFyZ2V0Lmxlbmd0aCA9PSAwKSB7dGFyZ2V0PW51bGx9XG4gICAgXG4gICAgICAgIHRoaXMubWF0ZXJpYWxzID0gdXBkYXRlV2l0aFNoYWRlcihXYXJwUG9ydGFsU2hhZGVyLCB0aGlzLmVsLCB0YXJnZXQsIHtcbiAgICAgICAgICAgIHJhZGl1czogdGhpcy5yYWRpdXMsXG4gICAgICAgICAgICByaW5nQ29sb3I6IHRoaXMuY29sb3IsXG4gICAgICAgICAgICBjdWJlTWFwOiB0aGlzLmN1YmVNYXAsXG4gICAgICAgICAgICBpbnZlcnRXYXJwQ29sb3I6IHRoaXMucG9ydGFsVHlwZSA9PSAxID8gMSA6IDBcbiAgICAgICAgfSlcblxuICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDEgJiYgdGhpcy5wb3J0YWxUYXJnZXQgIT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0uZ2V0Q3ViZU1hcCh0aGlzLnBvcnRhbFRhcmdldCwgdGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldCkudGhlbiggdXJscyA9PiB7XG4gICAgICAgICAgICAgICAgLy9jb25zdCB1cmxzID0gW2N1YmVNYXBQb3NYLCBjdWJlTWFwTmVnWCwgY3ViZU1hcFBvc1ksIGN1YmVNYXBOZWdZLCBjdWJlTWFwUG9zWiwgY3ViZU1hcE5lZ1pdO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRleHR1cmUgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLkN1YmVUZXh0dXJlTG9hZGVyKCkubG9hZCh1cmxzLCByZXNvbHZlLCB1bmRlZmluZWQsIHJlamVjdClcbiAgICAgICAgICAgICAgICApLnRoZW4odGV4dHVyZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuICAgICAgICAgICAgICAgICAgICAvL3RoaXMubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRleHR1cmU7XG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHttYXQudXNlckRhdGEuY3ViZU1hcCA9IHRleHR1cmU7fSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdWJlTWFwID0gdGV4dHVyZVxuICAgICAgICAgICAgICAgIH0pLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlKSkgICAgXG4gICAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSA0KSB7XG4gICAgICAgICAgICB0aGlzLnN5c3RlbS5nZXRDdWJlTWFwQnlOYW1lKHRoaXMucG9ydGFsVGFyZ2V0LCB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0KS50aGVuKCB1cmxzID0+IHtcbiAgICAgICAgICAgICAgICAvL2NvbnN0IHVybHMgPSBbY3ViZU1hcFBvc1gsIGN1YmVNYXBOZWdYLCBjdWJlTWFwUG9zWSwgY3ViZU1hcE5lZ1ksIGN1YmVNYXBQb3NaLCBjdWJlTWFwTmVnWl07XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5DdWJlVGV4dHVyZUxvYWRlcigpLmxvYWQodXJscywgcmVzb2x2ZSwgdW5kZWZpbmVkLCByZWplY3QpXG4gICAgICAgICAgICAgICAgKS50aGVuKHRleHR1cmUgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLm1hdGVyaWFsLnVuaWZvcm1zLmN1YmVNYXAudmFsdWUgPSB0ZXh0dXJlO1xuICAgICAgICAgICAgICAgICAgICAvL3RoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7bWF0LnVzZXJEYXRhLmN1YmVNYXAgPSB0ZXh0dXJlO30pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZU1hcCA9IHRleHR1cmVcbiAgICAgICAgICAgICAgICB9KS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoZSkpICAgIFxuICAgICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMiB8fCB0aGlzLnBvcnRhbFR5cGUgPT0gMykgeyBcbiAgICAgICAgICAgIGlmIChUSFJFRS5SRVZJU0lPTiA8IDEyNSkgeyAgIFxuICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYSA9IG5ldyBDdWJlQ2FtZXJhV3JpdGVyKDAuMSwgMTAwMCwgMTAyNClcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY3ViZVJlbmRlclRhcmdldCA9IG5ldyBUSFJFRS5XZWJHTEN1YmVSZW5kZXJUYXJnZXQoIDEwMjQsIHsgZW5jb2Rpbmc6IFRIUkVFLnNSR0JFbmNvZGluZywgZ2VuZXJhdGVNaXBtYXBzOiB0cnVlIH0gKVxuICAgICAgICAgICAgICAgIHRoaXMuY3ViZUNhbWVyYSA9IG5ldyBDdWJlQ2FtZXJhV3JpdGVyKDEsIDEwMDAwMCwgY3ViZVJlbmRlclRhcmdldClcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy90aGlzLmN1YmVDYW1lcmEucm90YXRlWShNYXRoLlBJKSAvLyBGYWNlIGZvcndhcmRzXG4gICAgICAgICAgICBpZiAodGhpcy5wb3J0YWxUeXBlID09IDIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELmFkZCh0aGlzLmN1YmVDYW1lcmEpXG4gICAgICAgICAgICAgICAgLy8gdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5tYXRlcmlhbC51bmlmb3Jtcy5jdWJlTWFwLnZhbHVlID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlIFxuICAgICAgICAgICAgICAgIC8vdGhpcy5vdGhlci5jb21wb25lbnRzLnBvcnRhbC5tYXRlcmlhbHMubWFwKChtYXQpID0+IHttYXQudXNlckRhdGEuY3ViZU1hcCA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZTt9KVxuICAgICAgICAgICAgICAgIHRoaXMub3RoZXIuY29tcG9uZW50cy5wb3J0YWwuY3ViZU1hcCA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsZXQgd2F5cG9pbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKHRoaXMucG9ydGFsVGFyZ2V0KVxuICAgICAgICAgICAgICAgIGlmICh3YXlwb2ludC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHdheXBvaW50ID0gd2F5cG9pbnQuaXRlbSgwKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1YmVDYW1lcmEucG9zaXRpb24ueSA9IDEuNlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1YmVDYW1lcmEubmVlZHNVcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAgICAgICAgIHdheXBvaW50Lm9iamVjdDNELmFkZCh0aGlzLmN1YmVDYW1lcmEpXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMuY3ViZU1hcC52YWx1ZSA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZTtcbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLm1hdGVyaWFscy5tYXAoKG1hdCkgPT4ge21hdC51c2VyRGF0YS5jdWJlTWFwID0gdGhpcy5jdWJlQ2FtZXJhLnJlbmRlclRhcmdldC50ZXh0dXJlO30pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3ViZU1hcCA9IHRoaXMuY3ViZUNhbWVyYS5yZW5kZXJUYXJnZXQudGV4dHVyZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMudXBkYXRlUG9ydGFsKClcbiAgICAgICAgICAgIHRoaXMuZWwuc2NlbmVFbC5hZGRFdmVudExpc3RlbmVyKCd1cGRhdGVQb3J0YWxzJywgdGhpcy51cGRhdGVQb3J0YWwpXG4gICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcignbW9kZWwtbG9hZGVkJywgdGhpcy51cGRhdGVQb3J0YWwpXG4gICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcignbWVkaWEtbG9hZGVkJywgdGhpcy51cGRhdGVQb3J0YWwpXG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcm90ID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKVxuICAgICAgICBsZXQgc2NhbGVXID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuICAgICAgICBsZXQgcG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELm1hdHJpeFdvcmxkLmRlY29tcG9zZShwb3MsIHJvdCwgc2NhbGVXKVxuICAgICAgICBsZXQgc2NhbGVNID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl0uc2NhbGVcblxuICAgICAgICAvLyBsZXQgc2NhbGVYID0gc2NhbGVNLnggKiBzY2FsZUkueFxuICAgICAgICAvLyBsZXQgc2NhbGVZID0gc2NhbGVNLnkgKiBzY2FsZUkueVxuICAgICAgICAvLyBsZXQgc2NhbGVaID0gc2NhbGVNLnogKiBzY2FsZUkuelxuXG4gICAgICAgIC8vIHRoaXMucG9ydGFsV2lkdGggPSBzY2FsZVggLyAyXG4gICAgICAgIC8vIHRoaXMucG9ydGFsSGVpZ2h0ID0gc2NhbGVZIC8gMlxuXG4gICAgICAgIC8vIG9mZnNldCB0byBjZW50ZXIgb2YgcG9ydGFsIGFzc3VtaW5nIHdhbGtpbmcgb24gZ3JvdW5kXG4gICAgICAgIC8vIHRoaXMuWW9mZnNldCA9IC0odGhpcy5lbC5vYmplY3QzRC5wb3NpdGlvbi55IC0gMS42KVxuICAgICAgICB0aGlzLllvZmZzZXQgPSAtKChzY2FsZVcueSAqIHNjYWxlTS55KS8yIC0gMS42KVxuICAgICAgICBcbiAgICAgICAgdGhpcy5jbG9zZSgpXG4gICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdwcm94aW1pdHktZXZlbnRzJywgeyByYWRpdXM6IDQsIFlvZmZzZXQ6IHRoaXMuWW9mZnNldCB9KVxuICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWVudGVyJywgKCkgPT4gdGhpcy5vcGVuKCkpXG4gICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncHJveGltaXR5bGVhdmUnLCAoKSA9PiB0aGlzLmNsb3NlKCkpXG5cbiAgICAgICAgdGhpcy5lbC5zZXRPYmplY3QzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgIFxuICAgICAgICBpZiAodGhpcy5kYXRhLnRleHQgJiYgdGhpcy5kYXRhLnRleHQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdmFyIHRpdGxlU2NyaXB0RGF0YSA9IHtcbiAgICAgICAgICAgICAgICB3aWR0aDogdGhpcy5kYXRhLnRleHRTaXplLngsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLmRhdGEudGV4dFNpemUueSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiB0aGlzLmRhdGEudGV4dFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBkb24ndCB3YW50IHRvIHByb2NlZWQgdW50aWwgdGhlIGNhY2hlIGlzIGxvYWRlZFxuICAgICAgICAgICAgLy9hd2FpdCB0aGlzLnN5c3RlbS53YWl0Rm9yQ2FjaGUoKTtcblxuICAgICAgICAgICAgY29uc3QgcG9ydGFsVGl0bGUgPSBodG1sQ29tcG9uZW50c1tcIlBvcnRhbFRpdGxlXCJdXG4gICAgICAgICAgICAvLyBjb25zdCBwb3J0YWxTdWJ0aXRsZSA9IGh0bWxDb21wb25lbnRzW1wiUG9ydGFsU3VidGl0bGVcIl1cblxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZSA9IHBvcnRhbFRpdGxlKHRpdGxlU2NyaXB0RGF0YSlcbiAgICAgICAgICAgIC8vIHRoaXMucG9ydGFsU3VidGl0bGUgPSBwb3J0YWxTdWJ0aXRsZShzdWJ0aXRsZVNjcmlwdERhdGEpXG5cbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2FpdEZvclJlYWR5KCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbC5zZXRPYmplY3QzRCgncG9ydGFsVGl0bGUnLCB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0QpXG4gICAgICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG5cbiAgICAgICAgICAgICAgICBsZXQgc2l6ZSA9IHRoaXMucG9ydGFsVGl0bGUuZ2V0U2l6ZSgpXG4gICAgICAgICAgICAgICAgbGV0IHRpdGxlU2NhbGVYID0gKHNjYWxlVy54KSAvIHRoaXMuZGF0YS50ZXh0U2NhbGVcbiAgICAgICAgICAgICAgICBsZXQgdGl0bGVTY2FsZVkgPSAoc2NhbGVXLnkpIC8gdGhpcy5kYXRhLnRleHRTY2FsZVxuICAgICAgICAgICAgICAgIGxldCB0aXRsZVNjYWxlWiA9IChzY2FsZVcueikgLyB0aGlzLmRhdGEudGV4dFNjYWxlXG5cbiAgICAgICAgICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLndlYkxheWVyM0Quc2NhbGUueCAvPSB0aXRsZVNjYWxlWFxuICAgICAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5zY2FsZS55IC89IHRpdGxlU2NhbGVZXG4gICAgICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnNjYWxlLnogLz0gdGl0bGVTY2FsZVpcblxuICAgICAgICAgICAgICAgIHRoaXMucG9ydGFsVGl0bGUud2ViTGF5ZXIzRC5wb3NpdGlvbi54ID0gXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGEudGV4dFBvc2l0aW9uLnggLyAoc2NhbGVXLngpXG4gICAgICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnBvc2l0aW9uLnkgPSBcbiAgICAgICAgICAgICAgICAgICAgICAgICgwLjUgKiBzY2FsZU0ueSkgK1xuICAgICAgICAgICAgICAgICAgICAgICAgKHRoaXMuZGF0YS5kcmF3RG9vciA/IDAuMTA1IDogMCkgLyAoc2NhbGVXLnkpICtcbiAgICAgICAgICAgICAgICAgICAgICAgICgoc2l6ZS5oZWlnaHQgKiB0aGlzLmRhdGEudGV4dFNjYWxlKSAvMikgLyAoc2NhbGVXLnkpICsgXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGEudGV4dFBvc2l0aW9uLnkgLyAoc2NhbGVXLnkpXG4gICAgICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZS53ZWJMYXllcjNELnBvc2l0aW9uLnogPSBcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGF0YS50ZXh0UG9zaXRpb24ueiAvIChzY2FsZVcueilcbiAgICAgICAgICAgICAgICAvLyB0aGlzLmVsLnNldE9iamVjdDNEKCdwb3J0YWxTdWJ0aXRsZScsIHRoaXMucG9ydGFsU3VidGl0bGUud2ViTGF5ZXIzRClcbiAgICAgICAgICAgIC8vIHRoaXMucG9ydGFsU3VidGl0bGUud2ViTGF5ZXIzRC5wb3NpdGlvbi54ID0gMVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC8vIHRoaXMucG9ydGFsU3VidGl0bGUud2ViTGF5ZXIzRC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICAgIC8vIHRoaXMubWF0ZXJpYWxzLm1hcCgobWF0KSA9PiB7XG4gICAgICAgIC8vICAgICBtYXQudXNlckRhdGEucmFkaXVzID0gdGhpcy5yYWRpdXNcbiAgICAgICAgLy8gICAgIG1hdC51c2VyRGF0YS5yaW5nQ29sb3IgPSB0aGlzLmNvbG9yXG4gICAgICAgIC8vICAgICBtYXQudXNlckRhdGEuY3ViZU1hcCA9IHRoaXMuY3ViZU1hcFxuICAgICAgICAvLyB9KVxuICAgIH0sXG5cbiAgICByZW1vdmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5lbC5zY2VuZUVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3VwZGF0ZVBvcnRhbHMnLCB0aGlzLnVwZGF0ZVBvcnRhbClcbiAgICAgICAgdGhpcy5lbC5zY2VuZUVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vZGVsLWxvYWRlZCcsIHRoaXMudXBkYXRlUG9ydGFsKVxuICAgICAgICB0aGlzLmVsLnNjZW5lRWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignbWVkaWEtbG9hZGVkJywgdGhpcy51cGRhdGVQb3J0YWwpXG5cbiAgICAgICAgaWYgKHRoaXMucG9ydGFsVGl0bGUpIHtcbiAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlT2JqZWN0M0QoXCJwb3J0YWxUaXRsZVwiKVxuXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLmRlc3Ryb3koKVxuICAgICAgICAgICAgdGhpcy5wb3J0YWxUaXRsZSA9IG51bGxcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5jdWJlTWFwKSB7XG4gICAgICAgICAgICB0aGlzLmN1YmVNYXAuZGlzcG9zZSgpXG4gICAgICAgICAgICB0aGlzLmN1YmVNYXAgPSBudWxsXG4gICAgICAgIH0gXG4gICAgfSxcblxuICAgICAgICAvLyAgIHJlcGxhY2VNYXRlcmlhbDogZnVuY3Rpb24gKG5ld01hdGVyaWFsKSB7XG4vLyAgICAgbGV0IHRhcmdldCA9IHRoaXMuZGF0YS5tYXRlcmlhbFRhcmdldFxuLy8gICAgIGlmICh0YXJnZXQgJiYgdGFyZ2V0Lmxlbmd0aCA9PSAwKSB7dGFyZ2V0PW51bGx9XG4gICAgXG4vLyAgICAgbGV0IHRyYXZlcnNlID0gKG9iamVjdCkgPT4ge1xuLy8gICAgICAgbGV0IG1lc2ggPSBvYmplY3Rcbi8vICAgICAgIGlmIChtZXNoLm1hdGVyaWFsKSB7XG4vLyAgICAgICAgICAgbWFwTWF0ZXJpYWxzKG1lc2gsIChtYXRlcmlhbCkgPT4geyAgICAgICAgIFxuLy8gICAgICAgICAgICAgICBpZiAoIXRhcmdldCB8fCBtYXRlcmlhbC5uYW1lID09PSB0YXJnZXQpIHtcbi8vICAgICAgICAgICAgICAgICAgIG1lc2gubWF0ZXJpYWwgPSBuZXdNYXRlcmlhbFxuLy8gICAgICAgICAgICAgICB9XG4vLyAgICAgICAgICAgfSlcbi8vICAgICAgIH1cbi8vICAgICAgIGNvbnN0IGNoaWxkcmVuID0gb2JqZWN0LmNoaWxkcmVuO1xuLy8gICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuLy8gICAgICAgICAgIHRyYXZlcnNlKGNoaWxkcmVuW2ldKTtcbi8vICAgICAgIH1cbi8vICAgICB9XG5cbi8vICAgICBsZXQgcmVwbGFjZU1hdGVyaWFscyA9ICgpID0+IHtcbi8vICAgICAgICAgLy8gbWVzaCB3b3VsZCBjb250YWluIHRoZSBvYmplY3QgdGhhdCBpcywgb3IgY29udGFpbnMsIHRoZSBtZXNoZXNcbi8vICAgICAgICAgdmFyIG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwLm1lc2hcbi8vICAgICAgICAgaWYgKCFtZXNoKSB7XG4vLyAgICAgICAgICAgICAvLyBpZiBubyBtZXNoLCB3ZSdsbCBzZWFyY2ggdGhyb3VnaCBhbGwgb2YgdGhlIGNoaWxkcmVuLiAgVGhpcyB3b3VsZFxuLy8gICAgICAgICAgICAgLy8gaGFwcGVuIGlmIHdlIGRyb3BwZWQgdGhlIGNvbXBvbmVudCBvbiBhIGdsYiBpbiBzcG9rZVxuLy8gICAgICAgICAgICAgbWVzaCA9IHRoaXMuZWwub2JqZWN0M0Rcbi8vICAgICAgICAgfVxuLy8gICAgICAgICB0cmF2ZXJzZShtZXNoKTtcbi8vICAgICAgICAvLyB0aGlzLmVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgaW5pdGlhbGl6ZXIpO1xuLy8gICAgIH1cblxuLy8gICAgIC8vIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuLy8gICAgIC8vIGxldCBpbml0aWFsaXplciA9ICgpID0+e1xuLy8gICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuLy8gICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1lZGlhLWxvYWRlZFwiLCByZXBsYWNlTWF0ZXJpYWxzKVxuLy8gICAgICAgfSBlbHNlIHtcbi8vICAgICAgICAgICByZXBsYWNlTWF0ZXJpYWxzKClcbi8vICAgICAgIH1cbi8vICAgICAvLyB9O1xuLy8gICAgIC8vcmVwbGFjZU1hdGVyaWFscygpXG4vLyAgICAgLy8gcm9vdC5hZGRFdmVudExpc3RlbmVyKFwibW9kZWwtbG9hZGVkXCIsIGluaXRpYWxpemVyKTtcbi8vICAgfSxcblxuLy8gICBmb2xsb3dQb3J0YWw6IGZ1bmN0aW9uKCkge1xuLy8gICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMSkge1xuLy8gICAgICAgICBjb25zb2xlLmxvZyhcInNldCB3aW5kb3cubG9jYXRpb24uaHJlZiB0byBcIiArIHRoaXMub3RoZXIpXG4vLyAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gdGhpcy5vdGhlclxuLy8gICAgICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMikge1xuLy8gICAgICAgICB0aGlzLnN5c3RlbS50ZWxlcG9ydFRvKHRoaXMub3RoZXIub2JqZWN0M0QpXG4vLyAgICAgICB9XG4vLyAgIH0sXG5cbiAgICBzZXR1cERvb3I6IGZ1bmN0aW9uKCkge1xuICAgICAgICAvLyBhdHRhY2hlZCB0byBhbiBpbWFnZSBpbiBzcG9rZS4gIFRoaXMgaXMgdGhlIG9ubHkgd2F5IHdlIGFsbG93IGJ1aWRsaW5nIGEgXG4gICAgICAgIC8vIGRvb3IgYXJvdW5kIGl0XG4gICAgICAgIGxldCBzY2FsZU0gPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXS5zY2FsZVxuICAgICAgICBsZXQgcm90ID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKVxuICAgICAgICBsZXQgc2NhbGVXID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuICAgICAgICBsZXQgcG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELm1hdHJpeFdvcmxkLmRlY29tcG9zZShwb3MsIHJvdCwgc2NhbGVXKVxuXG4gICAgICAgIHZhciB3aWR0aCA9IHNjYWxlVy54ICogc2NhbGVNLnhcbiAgICAgICAgdmFyIGhlaWdodCA9IHNjYWxlVy55ICogc2NhbGVNLnlcbiAgICAgICAgdmFyIGRlcHRoID0gc2NhbGVXLnogKiBzY2FsZU0uelxuICAgICAgICBcbiAgICAgICAgLy8gbGV0IHNjYWxlSSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgLy8gdmFyIHdpZHRoID0gc2NhbGVNLnggKiBzY2FsZUkueFxuICAgICAgICAvLyB2YXIgaGVpZ2h0ID0gc2NhbGVNLnkgKiBzY2FsZUkueVxuICAgICAgICAvLyB2YXIgZGVwdGggPSAxLjA7IC8vICBzY2FsZU0ueiAqIHNjYWxlSS56XG4gICAgICAgIGNvbnN0IGVudmlyb25tZW50TWFwQ29tcG9uZW50ID0gdGhpcy5lbC5zY2VuZUVsLmNvbXBvbmVudHNbXCJlbnZpcm9ubWVudC1tYXBcIl07XG5cbiAgICAgICAgLy8gbGV0IGFib3ZlID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgIC8vICAgICBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoMSwgNTAsIDUwKSxcbiAgICAgICAgLy8gICAgIGRvb3JtYXRlcmlhbFkgXG4gICAgICAgIC8vICk7XG4gICAgICAgIC8vIGlmIChlbnZpcm9ubWVudE1hcENvbXBvbmVudCkge1xuICAgICAgICAvLyAgICAgZW52aXJvbm1lbnRNYXBDb21wb25lbnQuYXBwbHlFbnZpcm9ubWVudE1hcChhYm92ZSk7XG4gICAgICAgIC8vIH1cbiAgICAgICAgLy8gYWJvdmUucG9zaXRpb24uc2V0KDAsIDIuNSwgMClcbiAgICAgICAgLy8gdGhpcy5lbC5vYmplY3QzRC5hZGQoYWJvdmUpXG5cbiAgICAgICAgbGV0IGxlZnQgPSBuZXcgVEhSRUUuTWVzaChcbiAgICAgICAgICAgIC8vIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgwLjEvd2lkdGgsMi9oZWlnaHQsMC4xL2RlcHRoLDIsNSwyKSxcbiAgICAgICAgICAgIG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgwLjEvd2lkdGgsMSwwLjA5OS9kZXB0aCwyLDUsMiksXG4gICAgICAgICAgICBbZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbCxkb29ybWF0ZXJpYWxZLCBkb29ybWF0ZXJpYWxZLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWxdLCBcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoZW52aXJvbm1lbnRNYXBDb21wb25lbnQpIHtcbiAgICAgICAgICAgIGVudmlyb25tZW50TWFwQ29tcG9uZW50LmFwcGx5RW52aXJvbm1lbnRNYXAobGVmdCk7XG4gICAgICAgIH1cbiAgICAgICAgbGVmdC5wb3NpdGlvbi5zZXQoLTAuNTEsIDAsIDApXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKGxlZnQpXG5cbiAgICAgICAgbGV0IHJpZ2h0ID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMC4xL3dpZHRoLDEsMC4wOTkvZGVwdGgsMiw1LDIpLFxuICAgICAgICAgICAgW2Rvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWwsZG9vcm1hdGVyaWFsWSwgZG9vcm1hdGVyaWFsWSxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsXSwgXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGVudmlyb25tZW50TWFwQ29tcG9uZW50KSB7XG4gICAgICAgICAgICBlbnZpcm9ubWVudE1hcENvbXBvbmVudC5hcHBseUVudmlyb25tZW50TWFwKHJpZ2h0KTtcbiAgICAgICAgfVxuICAgICAgICByaWdodC5wb3NpdGlvbi5zZXQoMC41MSwgMCwgMClcbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5hZGQocmlnaHQpXG5cbiAgICAgICAgbGV0IHRvcCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KDEgKyAwLjMvd2lkdGgsMC4xL2hlaWdodCwwLjEvZGVwdGgsMiw1LDIpLFxuICAgICAgICAgICAgW2Rvb3JtYXRlcmlhbFksZG9vcm1hdGVyaWFsWSxkb29yTWF0ZXJpYWwsZG9vck1hdGVyaWFsLGRvb3JNYXRlcmlhbCxkb29yTWF0ZXJpYWxdLCBcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoZW52aXJvbm1lbnRNYXBDb21wb25lbnQpIHtcbiAgICAgICAgICAgIGVudmlyb25tZW50TWFwQ29tcG9uZW50LmFwcGx5RW52aXJvbm1lbnRNYXAodG9wKTtcbiAgICAgICAgfVxuICAgICAgICB0b3AucG9zaXRpb24uc2V0KDAuMCwgMC41MDUsIDApXG4gICAgICAgIHRoaXMuZWwub2JqZWN0M0QuYWRkKHRvcClcblxuICAgICAgICAvLyBpZiAod2lkdGggPiAwICYmIGhlaWdodCA+IDApIHtcbiAgICAgICAgLy8gICAgIGNvbnN0IHt3aWR0aDogd3NpemUsIGhlaWdodDogaHNpemV9ID0gdGhpcy5zY3JpcHQuZ2V0U2l6ZSgpXG4gICAgICAgIC8vICAgICB2YXIgc2NhbGUgPSBNYXRoLm1pbih3aWR0aCAvIHdzaXplLCBoZWlnaHQgLyBoc2l6ZSlcbiAgICAgICAgLy8gICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZShcInNjYWxlXCIsIHsgeDogc2NhbGUsIHk6IHNjYWxlLCB6OiBzY2FsZX0pO1xuICAgICAgICAvLyB9XG4gICAgfSxcblxuICAgIC8vIGhpZGVSb29tOiBmdW5jdGlvbigpIHtcbiAgICAvLyAgICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIi5hLWNhbnZhc1wiKTtcbiAgICAvLyAgICAgY2FudmFzLmNsYXNzTGlzdC5hZGQoXCJhLWhpZGRlblwiKTtcbiAgICAvLyB9LCAgICAgIFxuICAgIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgICAgIC8vdGhpcy5tYXRlcmlhbC51bmlmb3Jtcy50aW1lLnZhbHVlID0gdGltZSAvIDEwMDBcbiAgICAgICAgaWYgKCF0aGlzLm1hdGVyaWFscykgeyByZXR1cm4gfVxuXG4gICAgICAgIGlmICh0aGlzLnBvcnRhbFRpdGxlKSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRpdGxlLnRpY2sodGltZSlcbiAgICAgICAgICAgIC8vIHRoaXMucG9ydGFsU3VidGl0bGUudGljayh0aW1lKVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tYXRlcmlhbHMubWFwKChtYXQpID0+IHtcbiAgICAgICAgICAgIG1hdC51c2VyRGF0YS5yYWRpdXMgPSB0aGlzLnJhZGl1c1xuICAgICAgICAgICAgbWF0LnVzZXJEYXRhLmN1YmVNYXAgPSB0aGlzLmN1YmVNYXBcbiAgICAgICAgICAgIFdhcnBQb3J0YWxTaGFkZXIudXBkYXRlVW5pZm9ybXModGltZSwgbWF0KVxuICAgICAgICB9KVxuXG4gICAgICAgIGlmICh0aGlzLm90aGVyICYmICF0aGlzLnN5c3RlbS50ZWxlcG9ydGluZykge1xuICAgICAgICAvLyAgIHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbih3b3JsZFBvcylcbiAgICAgICAgLy8gICB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24od29ybGRDYW1lcmFQb3MpXG4gICAgICAgIC8vICAgd29ybGRDYW1lcmFQb3MueSAtPSB0aGlzLllvZmZzZXRcbiAgICAgICAgLy8gICBjb25zdCBkaXN0ID0gd29ybGRDYW1lcmFQb3MuZGlzdGFuY2VUbyh3b3JsZFBvcylcbiAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24od29ybGRDYW1lcmFQb3MpXG4gICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC53b3JsZFRvTG9jYWwod29ybGRDYW1lcmFQb3MpXG5cbiAgICAgICAgICAvLyBpbiBsb2NhbCBwb3J0YWwgY29vcmRpbmF0ZXMsIHRoZSB3aWR0aCBhbmQgaGVpZ2h0IGFyZSAxXG4gICAgICAgICAgaWYgKE1hdGguYWJzKHdvcmxkQ2FtZXJhUG9zLngpID4gMC41IHx8IE1hdGguYWJzKHdvcmxkQ2FtZXJhUG9zLnkpID4gMC41KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IGRpc3QgPSBNYXRoLmFicyh3b3JsZENhbWVyYVBvcy56KTtcblxuICAgICAgICAgIC8vIHdpbmRvdy5BUFAudXRpbHMuY2hhbmdlVG9IdWJcbiAgICAgICAgICBpZiAoKHRoaXMucG9ydGFsVHlwZSA9PSAxIHx8IHRoaXMucG9ydGFsVHlwZSA9PSA0KSAmJiBkaXN0IDwgMC4yNSkge1xuICAgICAgICAgICAgICBpZiAoIXRoaXMubG9jYXRpb25ocmVmKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2NhdGlvbmhyZWYgPSB0aGlzLm90aGVyO1xuICAgICAgICAgICAgICAgIGlmICghQVBQLnN0b3JlLnN0YXRlLnByZWZlcmVuY2VzLmZhc3RSb29tU3dpdGNoaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5ocmVmIHRvIFwiICsgdGhpcy5vdGhlcik7XG4gICAgICAgICAgICAgICAgICAgIC8vdGhpcy5oaWRlUm9vbSgpO1xuICAgICAgICAgICAgICAgICAgICAvL3dpbmRvdy5sb2NhdGlvbi5ocmVmID0gdGhpcy5vdGhlcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zeXN0ZW0uZ29Ub1VSTCh0aGlzLm90aGVyKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsZXQgd2F5UG9pbnQgPSB0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVudmlyb25tZW50U2NlbmUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2Vudmlyb25tZW50LXNjZW5lXCIpO1xuICAgICAgICAgICAgICAgICAgICBsZXQgZ29Ub1dheVBvaW50ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAod2F5UG9pbnQgJiYgd2F5UG9pbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRkFTVCBST09NIFNXSVRDSCBJTkNMVURFUyB3YXlwb2ludDogc2V0dGluZyBoYXNoIHRvIFwiICsgd2F5UG9pbnQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSB3YXlQb2ludFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRkFTVCBST09NIFNXSVRDSC4gZ29pbmcgdG8gXCIgKyB0aGlzLmh1Yl9pZClcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuaHViSWQgPT09IEFQUC5odWIuaHViX2lkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIlNhbWUgUm9vbVwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgZ29Ub1dheVBvaW50KClcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5jaGFuZ2VIdWIodGhpcy5odWJfaWQpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVudmlyb25tZW50U2NlbmUuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgIGNvbnNvbGUubG9nKFwiRW52aXJvbm1lbnQgc2NlbmUgaGFzIGxvYWRlZFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ29Ub1dheVBvaW50KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMiAmJiBkaXN0IDwgMC4yNSkge1xuICAgICAgICAgICAgdGhpcy5zeXN0ZW0udGVsZXBvcnRUbyh0aGlzLm90aGVyLm9iamVjdDNEKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAzKSB7XG4gICAgICAgICAgICAgIGlmIChkaXN0IDwgMC4yNSkge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5sb2NhdGlvbmhyZWYpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwic2V0IHdpbmRvdy5sb2NhdGlvbi5oYXNoIHRvIFwiICsgdGhpcy5vdGhlcilcbiAgICAgICAgICAgICAgICAgIHRoaXMubG9jYXRpb25ocmVmID0gdGhpcy5vdGhlcjtcbiAgICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gdGhpcy5vdGhlcjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAvLyBpZiB3ZSBzZXQgbG9jYXRpb25ocmVmLCB3ZSB0ZWxlcG9ydGVkLiAgd2hlbiBpdFxuICAgICAgICAgICAgICAgICAgLy8gZmluYWxseSBoYXBwZW5zLCBhbmQgd2UgbW92ZSBvdXRzaWRlIHRoZSByYW5nZSBvZiB0aGUgcG9ydGFsLFxuICAgICAgICAgICAgICAgICAgLy8gd2Ugd2lsbCBjbGVhciB0aGUgZmxhZ1xuICAgICAgICAgICAgICAgICAgdGhpcy5sb2NhdGlvbmhyZWYgPSBudWxsXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICBnZXRPdGhlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMCkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUobnVsbClcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlICA9PSAxKSB7XG4gICAgICAgICAgICAgICAgLy8gZmlyc3Qgd2FpdCBmb3IgdGhlIGh1Yl9pZFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnBvcnRhbFRhcmdldCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3lzdGVtLmdldFJvb21IdWJJZCh0aGlzLnBvcnRhbFRhcmdldCkudGhlbihodWJfaWQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5odWJfaWQgPSBodWJfaWRcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSB0YXJnZXQgaXMgYW5vdGhlciByb29tLCByZXNvbHZlIHdpdGggdGhlIFVSTCB0byB0aGUgcm9vbVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zeXN0ZW0uZ2V0Um9vbVVSTCh0aGlzLnBvcnRhbFRhcmdldCkudGhlbih1cmwgPT4geyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXVybCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG51bGwpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0ICYmIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCArIFwiI1wiICsgdGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCkgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKG51bGwpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLnBvcnRhbFR5cGUgPT0gMikge1xuICAgICAgICAgICAgICAgICAgLy8gbm93IGZpbmQgdGhlIHBvcnRhbCB3aXRoaW4gdGhlIHJvb20uICBUaGUgcG9ydGFscyBzaG91bGQgY29tZSBpbiBwYWlycyB3aXRoIHRoZSBzYW1lIHBvcnRhbFRhcmdldFxuICAgICAgICAgICAgICAgIGNvbnN0IHBvcnRhbHMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtwb3J0YWxdYCkpXG4gICAgICAgICAgICAgICAgY29uc3Qgb3RoZXIgPSBwb3J0YWxzLmZpbmQoKGVsKSA9PiBlbC5jb21wb25lbnRzLnBvcnRhbC5wb3J0YWxUeXBlID09IHRoaXMucG9ydGFsVHlwZSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNvbXBvbmVudHMucG9ydGFsLnBvcnRhbFRhcmdldCA9PT0gdGhpcy5wb3J0YWxUYXJnZXQgJiYgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWwgIT09IHRoaXMuZWwpXG4gICAgICAgICAgICAgICAgaWYgKG90aGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2FzZSAxOiBUaGUgb3RoZXIgcG9ydGFsIGFscmVhZHkgZXhpc3RzXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUob3RoZXIpO1xuICAgICAgICAgICAgICAgICAgICBvdGhlci5lbWl0KCdwYWlyJywgeyBvdGhlcjogdGhpcy5lbCB9KSAvLyBMZXQgdGhlIG90aGVyIGtub3cgdGhhdCB3ZSdyZSByZWFkeVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIENhc2UgMjogV2UgY291bGRuJ3QgZmluZCB0aGUgb3RoZXIgcG9ydGFsLCB3YWl0IGZvciBpdCB0byBzaWduYWwgdGhhdCBpdCdzIHJlYWR5XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuYWRkRXZlbnRMaXN0ZW5lcigncGFpcicsIChldmVudCkgPT4geyBcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZXZlbnQuZGV0YWlsLm90aGVyKVxuICAgICAgICAgICAgICAgICAgICB9LCB7IG9uY2U6IHRydWUgfSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMucG9ydGFsVHlwZSA9PSAzKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSAoXCIjXCIgKyB0aGlzLnBvcnRhbFRhcmdldClcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5wb3J0YWxUeXBlID09IDQpIHtcbiAgICAgICAgICAgICAgICBsZXQgdXJsID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArIFwiL1wiICsgdGhpcy5wb3J0YWxUYXJnZXQ7XG4gICAgICAgICAgICAgICAgdGhpcy5odWJfaWQgPSB0aGlzLnBvcnRhbFRhcmdldFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuc2Vjb25kYXJ5VGFyZ2V0ICYmIHRoaXMuZGF0YS5zZWNvbmRhcnlUYXJnZXQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCArIFwiI1wiICsgdGhpcy5kYXRhLnNlY29uZGFyeVRhcmdldClcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHVybCkgXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0sXG5cbiAgICBwYXJzZU5vZGVOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNvbnN0IG5vZGVOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcblxuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIGVpdGhlciBcbiAgICAgICAgLy8gLSBcInJvb21fbmFtZV9jb2xvclwiXG4gICAgICAgIC8vIC0gXCJwb3J0YWxfTl9jb2xvclwiIFxuICAgICAgICAvLyBhdCB0aGUgdmVyeSBlbmQuIE51bWJlcmVkIHBvcnRhbHMgc2hvdWxkIGNvbWUgaW4gcGFpcnMuXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IG5vZGVOYW1lLm1hdGNoKC8oW0EtWmEtel0qKV8oW0EtWmEtejAtOV0qKV8oW0EtWmEtejAtOV0qKSQvKVxuICAgICAgICBcbiAgICAgICAgLy8gaWYgcGF0dGVybiBtYXRjaGVzLCB3ZSB3aWxsIGhhdmUgbGVuZ3RoIG9mIDQsIGZpcnN0IG1hdGNoIGlzIHRoZSBwb3J0YWwgdHlwZSxcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBuYW1lIG9yIG51bWJlciwgYW5kIGxhc3QgaXMgdGhlIGNvbG9yXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCA0KSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJwb3J0YWwgbm9kZSBuYW1lIG5vdCBmb3JtZWQgY29ycmVjdGx5OiBcIiwgbm9kZU5hbWUpXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IG51bGxcbiAgICAgICAgICAgIHRoaXMuY29sb3IgPSBcInJlZFwiIC8vIGRlZmF1bHQgc28gdGhlIHBvcnRhbCBoYXMgYSBjb2xvciB0byB1c2VcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBcbiAgICAgICAgdGhpcy5zZXRQb3J0YWxJbmZvKHBhcmFtc1sxXSwgcGFyYW1zWzJdLCBwYXJhbXNbM10pXG4gICAgfSxcblxuICAgIHNldFBvcnRhbEluZm86IGZ1bmN0aW9uKHBvcnRhbFR5cGUsIHBvcnRhbFRhcmdldCwgY29sb3IpIHtcbiAgICAgICAgaWYgKHBvcnRhbFR5cGUgPT09IFwicm9vbVwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAxO1xuICAgICAgICAgICAgaWYgKHBvcnRhbFRhcmdldC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBwYXJzZUludChwb3J0YWxUYXJnZXQpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gbnVsbFxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHBvcnRhbFR5cGUgPT09IFwicG9ydGFsXCIpIHtcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVHlwZSA9IDI7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFRhcmdldCA9IHBvcnRhbFRhcmdldFxuICAgICAgICB9IGVsc2UgaWYgKHBvcnRhbFR5cGUgPT09IFwid2F5cG9pbnRcIikge1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUeXBlID0gMztcbiAgICAgICAgICAgIHRoaXMucG9ydGFsVGFyZ2V0ID0gcG9ydGFsVGFyZ2V0XG4gICAgICAgIH0gZWxzZSBpZiAocG9ydGFsVHlwZSA9PT0gXCJyb29tTmFtZVwiKSB7XG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSA0O1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBwb3J0YWxUYXJnZXRcbiAgICAgICAgfSBlbHNlIHsgICAgXG4gICAgICAgICAgICB0aGlzLnBvcnRhbFR5cGUgPSAwO1xuICAgICAgICAgICAgdGhpcy5wb3J0YWxUYXJnZXQgPSBudWxsXG4gICAgICAgIH0gXG4gICAgICAgIHRoaXMuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3IoY29sb3IpXG4gICAgfSxcblxuICAgIHNldFJhZGl1cyh2YWwpIHtcbiAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FuaW1hdGlvbl9fcG9ydGFsJywge1xuICAgICAgICAvLyAgIGZyb206IHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlLFxuICAgICAgICAgICAgZnJvbTogdGhpcy5yYWRpdXMsXG4gICAgICAgICAgICB0bzogdmFsLFxuICAgICAgICB9KVxuICAgIH0sXG4gICAgb3BlbigpIHtcbiAgICAgICAgdGhpcy5zZXRSYWRpdXMoMSlcbiAgICB9LFxuICAgIGNsb3NlKCkge1xuICAgICAgICB0aGlzLnNldFJhZGl1cygwLjIpXG4gICAgfSxcbiAgICBpc0Nsb3NlZCgpIHtcbiAgICAgICAgLy8gcmV0dXJuIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMucmFkaXVzLnZhbHVlID09PSAwXG4gICAgICAgIHJldHVybiB0aGlzLnJhZGl1cyA9PT0gMC4yXG4gICAgfSxcbn0pIiwiZXhwb3J0IGRlZmF1bHQgXCJodHRwczovL3dpbGxpYW1jYXNleWx1Y2FzLmdpdGh1Yi5pby9jb3JlLWNvbXBvbmVudHMvZTE3MDJlYTIxYWZiNGE4Ni5wbmdcIiIsImNvbnN0IGdsc2wgPSBgXG52YXJ5aW5nIHZlYzIgYmFsbHZVdjtcbnZhcnlpbmcgdmVjMyBiYWxsdlBvc2l0aW9uO1xudmFyeWluZyB2ZWMzIGJhbGx2Tm9ybWFsO1xudmFyeWluZyB2ZWMzIGJhbGx2V29ybGRQb3M7XG51bmlmb3JtIGZsb2F0IGJhbGxUaW1lO1xudW5pZm9ybSBmbG9hdCBzZWxlY3RlZDtcblxubWF0NCBiYWxsaW52ZXJzZShtYXQ0IG0pIHtcbiAgZmxvYXRcbiAgICAgIGEwMCA9IG1bMF1bMF0sIGEwMSA9IG1bMF1bMV0sIGEwMiA9IG1bMF1bMl0sIGEwMyA9IG1bMF1bM10sXG4gICAgICBhMTAgPSBtWzFdWzBdLCBhMTEgPSBtWzFdWzFdLCBhMTIgPSBtWzFdWzJdLCBhMTMgPSBtWzFdWzNdLFxuICAgICAgYTIwID0gbVsyXVswXSwgYTIxID0gbVsyXVsxXSwgYTIyID0gbVsyXVsyXSwgYTIzID0gbVsyXVszXSxcbiAgICAgIGEzMCA9IG1bM11bMF0sIGEzMSA9IG1bM11bMV0sIGEzMiA9IG1bM11bMl0sIGEzMyA9IG1bM11bM10sXG5cbiAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgIGIwMSA9IGEwMCAqIGExMiAtIGEwMiAqIGExMCxcbiAgICAgIGIwMiA9IGEwMCAqIGExMyAtIGEwMyAqIGExMCxcbiAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgIGIwNCA9IGEwMSAqIGExMyAtIGEwMyAqIGExMSxcbiAgICAgIGIwNSA9IGEwMiAqIGExMyAtIGEwMyAqIGExMixcbiAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgIGIwNyA9IGEyMCAqIGEzMiAtIGEyMiAqIGEzMCxcbiAgICAgIGIwOCA9IGEyMCAqIGEzMyAtIGEyMyAqIGEzMCxcbiAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgIGIxMCA9IGEyMSAqIGEzMyAtIGEyMyAqIGEzMSxcbiAgICAgIGIxMSA9IGEyMiAqIGEzMyAtIGEyMyAqIGEzMixcblxuICAgICAgZGV0ID0gYjAwICogYjExIC0gYjAxICogYjEwICsgYjAyICogYjA5ICsgYjAzICogYjA4IC0gYjA0ICogYjA3ICsgYjA1ICogYjA2O1xuXG4gIHJldHVybiBtYXQ0KFxuICAgICAgYTExICogYjExIC0gYTEyICogYjEwICsgYTEzICogYjA5LFxuICAgICAgYTAyICogYjEwIC0gYTAxICogYjExIC0gYTAzICogYjA5LFxuICAgICAgYTMxICogYjA1IC0gYTMyICogYjA0ICsgYTMzICogYjAzLFxuICAgICAgYTIyICogYjA0IC0gYTIxICogYjA1IC0gYTIzICogYjAzLFxuICAgICAgYTEyICogYjA4IC0gYTEwICogYjExIC0gYTEzICogYjA3LFxuICAgICAgYTAwICogYjExIC0gYTAyICogYjA4ICsgYTAzICogYjA3LFxuICAgICAgYTMyICogYjAyIC0gYTMwICogYjA1IC0gYTMzICogYjAxLFxuICAgICAgYTIwICogYjA1IC0gYTIyICogYjAyICsgYTIzICogYjAxLFxuICAgICAgYTEwICogYjEwIC0gYTExICogYjA4ICsgYTEzICogYjA2LFxuICAgICAgYTAxICogYjA4IC0gYTAwICogYjEwIC0gYTAzICogYjA2LFxuICAgICAgYTMwICogYjA0IC0gYTMxICogYjAyICsgYTMzICogYjAwLFxuICAgICAgYTIxICogYjAyIC0gYTIwICogYjA0IC0gYTIzICogYjAwLFxuICAgICAgYTExICogYjA3IC0gYTEwICogYjA5IC0gYTEyICogYjA2LFxuICAgICAgYTAwICogYjA5IC0gYTAxICogYjA3ICsgYTAyICogYjA2LFxuICAgICAgYTMxICogYjAxIC0gYTMwICogYjAzIC0gYTMyICogYjAwLFxuICAgICAgYTIwICogYjAzIC0gYTIxICogYjAxICsgYTIyICogYjAwKSAvIGRldDtcbn1cblxuXG5tYXQ0IGJhbGx0cmFuc3Bvc2UoaW4gbWF0NCBtKSB7XG4gIHZlYzQgaTAgPSBtWzBdO1xuICB2ZWM0IGkxID0gbVsxXTtcbiAgdmVjNCBpMiA9IG1bMl07XG4gIHZlYzQgaTMgPSBtWzNdO1xuXG4gIHJldHVybiBtYXQ0KFxuICAgIHZlYzQoaTAueCwgaTEueCwgaTIueCwgaTMueCksXG4gICAgdmVjNChpMC55LCBpMS55LCBpMi55LCBpMy55KSxcbiAgICB2ZWM0KGkwLnosIGkxLnosIGkyLnosIGkzLnopLFxuICAgIHZlYzQoaTAudywgaTEudywgaTIudywgaTMudylcbiAgKTtcbn1cblxudm9pZCBtYWluKClcbntcbiAgYmFsbHZVdiA9IHV2O1xuXG4gIGJhbGx2UG9zaXRpb24gPSBwb3NpdGlvbjtcblxuICB2ZWMzIG9mZnNldCA9IHZlYzMoXG4gICAgc2luKHBvc2l0aW9uLnggKiA1MC4wICsgYmFsbFRpbWUpLFxuICAgIHNpbihwb3NpdGlvbi55ICogMTAuMCArIGJhbGxUaW1lICogMi4wKSxcbiAgICBjb3MocG9zaXRpb24ueiAqIDQwLjAgKyBiYWxsVGltZSlcbiAgKSAqIDAuMDAzO1xuXG4gICBiYWxsdlBvc2l0aW9uICo9IDEuMCArIHNlbGVjdGVkICogMC4yO1xuXG4gICBiYWxsdk5vcm1hbCA9IG5vcm1hbGl6ZShiYWxsaW52ZXJzZShiYWxsdHJhbnNwb3NlKG1vZGVsTWF0cml4KSkgKiB2ZWM0KG5vcm1hbGl6ZShub3JtYWwpLCAxLjApKS54eXo7XG4gICBiYWxsdldvcmxkUG9zID0gKG1vZGVsTWF0cml4ICogdmVjNChiYWxsdlBvc2l0aW9uLCAxLjApKS54eXo7XG5cbiAgIHZlYzQgYmFsbHZQb3NpdGlvbiA9IG1vZGVsVmlld01hdHJpeCAqIHZlYzQoYmFsbHZQb3NpdGlvbiArIG9mZnNldCwgMS4wKTtcblxuICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb25NYXRyaXggKiBiYWxsdlBvc2l0aW9uO1xufVxuYFxuXG5leHBvcnQgZGVmYXVsdCBnbHNsIiwiY29uc3QgZ2xzbCA9IGBcbnVuaWZvcm0gc2FtcGxlcjJEIHBhbm90ZXg7XG51bmlmb3JtIHNhbXBsZXIyRCB0ZXhmeDtcbnVuaWZvcm0gZmxvYXQgYmFsbFRpbWU7XG51bmlmb3JtIGZsb2F0IHNlbGVjdGVkO1xudmFyeWluZyB2ZWMyIGJhbGx2VXY7XG52YXJ5aW5nIHZlYzMgYmFsbHZQb3NpdGlvbjtcbnZhcnlpbmcgdmVjMyBiYWxsdk5vcm1hbDtcbnZhcnlpbmcgdmVjMyBiYWxsdldvcmxkUG9zO1xuXG51bmlmb3JtIGZsb2F0IG9wYWNpdHk7XG5cbnZvaWQgbWFpbiggdm9pZCApIHtcbiAgIHZlYzIgdXYgPSBiYWxsdlV2O1xuICAvL3V2LnkgPSAgMS4wIC0gdXYueTtcblxuICAgdmVjMyBleWUgPSBub3JtYWxpemUoY2FtZXJhUG9zaXRpb24gLSBiYWxsdldvcmxkUG9zKTtcbiAgIGZsb2F0IGZyZXNuZWwgPSBhYnMoZG90KGV5ZSwgYmFsbHZOb3JtYWwpKTtcbiAgIGZsb2F0IHNoaWZ0ID0gcG93KCgxLjAgLSBmcmVzbmVsKSwgNC4wKSAqIDAuMDU7XG5cbiAgdmVjMyBjb2wgPSB2ZWMzKFxuICAgIHRleHR1cmUyRChwYW5vdGV4LCB1diAtIHNoaWZ0KS5yLFxuICAgIHRleHR1cmUyRChwYW5vdGV4LCB1dikuZyxcbiAgICB0ZXh0dXJlMkQocGFub3RleCwgdXYgKyBzaGlmdCkuYlxuICApO1xuXG4gICBjb2wgPSBtaXgoY29sICogMC43LCB2ZWMzKDEuMCksIDAuNyAtIGZyZXNuZWwpO1xuXG4gICBjb2wgKz0gc2VsZWN0ZWQgKiAwLjM7XG5cbiAgIGZsb2F0IHQgPSBiYWxsVGltZSAqIDAuNCArIGJhbGx2UG9zaXRpb24ueCArIGJhbGx2UG9zaXRpb24uejtcbiAgIHV2ID0gdmVjMihiYWxsdlV2LnggKyB0ICogMC4yLCBiYWxsdlV2LnkgKyB0KTtcbiAgIHZlYzMgZnggPSB0ZXh0dXJlMkQodGV4ZngsIHV2KS5yZ2IgKiAwLjQ7XG5cbiAgLy92ZWM0IGNvbCA9IHZlYzQoMS4wLCAxLjAsIDAuMCwgMS4wKTtcbiAgZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2wgKyBmeCwgb3BhY2l0eSk7XG4gIC8vZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2wgKyBmeCwgMS4wKTtcbn1cbmBcblxuZXhwb3J0IGRlZmF1bHQgZ2xzbCIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiAzNjAgaW1hZ2UgdGhhdCBmaWxscyB0aGUgdXNlcidzIHZpc2lvbiB3aGVuIGluIGEgY2xvc2UgcHJveGltaXR5LlxuICpcbiAqIFVzYWdlXG4gKiA9PT09PT09XG4gKiBHaXZlbiBhIDM2MCBpbWFnZSBhc3NldCB3aXRoIHRoZSBmb2xsb3dpbmcgVVJMIGluIFNwb2tlOlxuICogaHR0cHM6Ly9ndC1hZWwtYXEtYXNzZXRzLmFlbGF0Z3QtaW50ZXJuYWwubmV0L2ZpbGVzLzEyMzQ1YWJjLTY3ODlkZWYuanBnXG4gKlxuICogVGhlIG5hbWUgb2YgdGhlIGBpbW1lcnNpdmUtMzYwLmdsYmAgaW5zdGFuY2UgaW4gdGhlIHNjZW5lIHNob3VsZCBiZTpcbiAqIFwic29tZS1kZXNjcmlwdGl2ZS1sYWJlbF9fMTIzNDVhYmMtNjc4OWRlZl9qcGdcIiBPUiBcIjEyMzQ1YWJjLTY3ODlkZWZfanBnXCJcbiAqL1xuXG5cbi8vIFRPRE86IFxuLy8gLSBhZGp1c3Qgc2l6ZSBvZiBwYW5vIGJhbGxcbi8vIC0gZHJvcCBvbiB2aWRlbyBvciBpbWFnZSBhbmQgcHVsbCB2aWRlby9pbWFnZSBmcm9tIHRoYXQgbWVkaWEgbG9jYXRpb25cbi8vIC0gaW50ZXJjZXB0IG1vdXNlIGlucHV0IHNvbWVob3c/ICAgIE5vdCBzdXJlIGlmIGl0J3MgcG9zc2libGUuXG5cblxuaW1wb3J0IGJhbGxmeCBmcm9tICcuLi9hc3NldHMvYmFsbGZ4LnBuZydcbmltcG9ydCBwYW5vdmVydCBmcm9tICcuLi9zaGFkZXJzL3Bhbm9iYWxsLnZlcnQnXG5pbXBvcnQgcGFub2ZyYWcgZnJvbSAnLi4vc2hhZGVycy9wYW5vYmFsbC5mcmFnJ1xuXG5jb25zdCB3b3JsZENhbWVyYSA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbmNvbnN0IHdvcmxkU2VsZiA9IG5ldyBUSFJFRS5WZWN0b3IzKClcblxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxudmFyIGJhbGxUZXggPSBudWxsXG5sb2FkZXIubG9hZChiYWxsZngsIChiYWxsKSA9PiB7XG4gICAgYmFsbC5taW5GaWx0ZXIgPSBUSFJFRS5OZWFyZXN0RmlsdGVyO1xuICAgIGJhbGwubWFnRmlsdGVyID0gVEhSRUUuTmVhcmVzdEZpbHRlcjtcbiAgICBiYWxsLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XG4gICAgYmFsbC53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xuICAgIGJhbGxUZXggPSBiYWxsXG59KVxuXG4vLyBzaW1wbGUgaGFjayB0byBnZXQgcG9zaXRpb24gb2YgcGFubyBtZWRpYSBhbGlnbmVkIHdpdGggY2FtZXJhLlxuLy8gU3lzdGVtcyBhcmUgdXBkYXRlZCBhZnRlciBjb21wb25lbnRzLCBzbyB3ZSBkbyB0aGUgZmluYWwgYWxpZ25tZW50XG4vLyB3aXRoIHRoZSBjYW1lcmEgYWZ0ZXIgYWxsIHRoZSBjb21wb25lbnRzIGFyZSB1cGRhdGVkLlxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdpbW1lcnNpdmUtMzYwJywge1xuICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy51cGRhdGVUaGlzID0gbnVsbDtcbiAgfSxcbiAgdXBkYXRlUG9zaXRpb24oY29tcG9uZW50KSB7XG4gICAgLy8gVE9ETzogIGFkZCB0aGlzIHRvIGEgcXVldWUsIGFuZCBwcm9jZXNzIHRoZSBxdWV1ZSBpbiB0aWNrKClcbiAgICB0aGlzLnVwZGF0ZVRoaXMgPSBjb21wb25lbnQ7XG4gIH0sXG5cbiAgdGljazogZnVuY3Rpb24gKCkge1xuICAgIC8vIFRPRE86IHByb2Nlc3MgdGhlIHF1ZXVlLCBwb3BwaW5nIGV2ZXJ5dGhpbmcgb2ZmIHRoZSBxdWV1ZSB3aGVuIHdlIGFyZSBkb25lXG4gICAgaWYgKHRoaXMudXBkYXRlVGhpcykge1xuICAgICAgaWYgKHdpbmRvdy5BUFAuc2NlbmUuaXMoXCJ2ci1tb2RlXCIpKSB7XG4gICAgICAgIHRoaXMudXBkYXRlVGhpcy5tZXNoLnBvc2l0aW9uLnNldCgwLDAsMCk7XG4gICAgICAgIGxldCByYWRpdXMgPSB0aGlzLnVwZGF0ZVRoaXMuZGF0YS5yYWRpdXM7XG4gICAgICAgIHRoaXMudXBkYXRlVGhpcy5tZXNoLnNjYWxlLnNldCgxMCtyYWRpdXMsMTArcmFkaXVzLDEwK3JhZGl1cyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLy9sZXQgY2FtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ2aWV3aW5nLWNhbWVyYVwiKS5vYmplY3QzRE1hcC5jYW1lcmE7XG4gICAgICAgIHRoaXMudXBkYXRlVGhpcy5lbC5zY2VuZUVsLmNhbWVyYS51cGRhdGVNYXRyaWNlcygpO1xuICAgICAgICB0aGlzLnVwZGF0ZVRoaXMuZWwuc2NlbmVFbC5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbih3b3JsZENhbWVyYSlcbiAgICAgICAgdGhpcy51cGRhdGVUaGlzLmVsLm9iamVjdDNELndvcmxkVG9Mb2NhbCh3b3JsZENhbWVyYSlcbiAgICAgICAgdGhpcy51cGRhdGVUaGlzLm1lc2gucG9zaXRpb24uY29weSh3b3JsZENhbWVyYSlcbiAgICAgICAgdGhpcy51cGRhdGVUaGlzLm1lc2guc2NhbGUuc2V0KDEsMSwxKTtcbiAgICAgIH1cbiAgICAgIHRoaXMudXBkYXRlVGhpcy5tZXNoLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgIHRoaXMudXBkYXRlVGhpcy5tZXNoLnVwZGF0ZVdvcmxkTWF0cml4KHRydWUsIGZhbHNlKVxuXG4gICAgICB0aGlzLnVwZGF0ZVRoaXMgPSBudWxsO1xuICAgIH1cbiAgfSxcblxufSlcbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnaW1tZXJzaXZlLTM2MCcsIHtcbiAgc2NoZW1hOiB7XG4gICAgdXJsOiB7IHR5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiBudWxsIH0sXG4gICAgcmFkaXVzOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAwLjE1IH0sXG4gIH0sXG5cbiAgaW5pdDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuc3lzdGVtID0gd2luZG93LkFQUC5zY2VuZS5zeXN0ZW1zWydpbW1lcnNpdmUtMzYwJ11cblxuICAgIHZhciB1cmwgPSB0aGlzLmRhdGEudXJsXG4gICAgaWYgKCF1cmwgfHwgdXJsID09IFwiXCIpIHtcbiAgICAgICAgdXJsID0gdGhpcy5wYXJzZVNwb2tlTmFtZSgpXG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGV4dGVuc2lvbiA9IHVybC5tYXRjaCgvXi4qXFwuKC4qKSQvKVsxXVxuXG4gICAgLy8gc2V0IHVwIHRoZSBsb2NhbCBjb250ZW50IGFuZCBob29rIGl0IHRvIHRoZSBzY2VuZVxuICAgIHRoaXMucGFubyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcbiAgICAvLyBtZWRpYS1pbWFnZSB3aWxsIHNldCB1cCB0aGUgc3BoZXJlIGdlb21ldHJ5IGZvciB1c1xuICAgIHRoaXMucGFuby5zZXRBdHRyaWJ1dGUoJ21lZGlhLWltYWdlJywge1xuICAgICAgcHJvamVjdGlvbjogJzM2MC1lcXVpcmVjdGFuZ3VsYXInLFxuICAgICAgYWxwaGFNb2RlOiAnb3BhcXVlJyxcbiAgICAgIHNyYzogdXJsLFxuICAgICAgdmVyc2lvbjogMSxcbiAgICAgIGJhdGNoOiBmYWxzZSxcbiAgICAgIGNvbnRlbnRUeXBlOiBgaW1hZ2UvJHtleHRlbnNpb259YCxcbiAgICAgIGFscGhhQ3V0b2ZmOiAwLFxuICAgIH0pXG4gICAvLyB0aGlzLnBhbm8ub2JqZWN0M0QucG9zaXRpb24ueSA9IDEuNlxuICAgIHRoaXMuZWwuYXBwZW5kQ2hpbGQodGhpcy5wYW5vKVxuXG4gICAgLy8gYnV0IHdlIG5lZWQgdG8gd2FpdCBmb3IgdGhpcyB0byBoYXBwZW5cbiAgICB0aGlzLm1lc2ggPSBhd2FpdCB0aGlzLmdldE1lc2goKVxuICAgIHRoaXMubWVzaC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZVxuICAgIHRoaXMubWVzaC51cGRhdGVXb3JsZE1hdHJpeCh0cnVlLCBmYWxzZSlcblxuICAgIHZhciBiYWxsID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgIG5ldyBUSFJFRS5TcGhlcmVCdWZmZXJHZW9tZXRyeSh0aGlzLmRhdGEucmFkaXVzLCAzMCwgMjApLFxuICAgICAgICBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgICAgICAgcGFub3RleDoge3ZhbHVlOiB0aGlzLm1lc2gubWF0ZXJpYWwubWFwfSxcbiAgICAgICAgICAgICAgdGV4Zng6IHt2YWx1ZTogYmFsbFRleH0sXG4gICAgICAgICAgICAgIHNlbGVjdGVkOiB7dmFsdWU6IDB9LFxuICAgICAgICAgICAgICBiYWxsVGltZToge3ZhbHVlOiAwfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHZlcnRleFNoYWRlcjogcGFub3ZlcnQsXG4gICAgICAgICAgICBmcmFnbWVudFNoYWRlcjogcGFub2ZyYWcsXG4gICAgICAgICAgICBzaWRlOiBUSFJFRS5CYWNrU2lkZSxcbiAgICAgICAgICB9KVxuICAgIClcbiAgIFxuICAgIC8vIGdldCB0aGUgcGFubyBvcmllbnRlZCBwcm9wZXJseSBpbiB0aGUgcm9vbSByZWxhdGl2ZSB0byB0aGUgd2F5IG1lZGlhLWltYWdlIGlzIG9yaWVudGVkXG4gICAgYmFsbC5yb3RhdGlvbi5zZXQoTWF0aC5QSSwgTWF0aC5QSSwgMCk7XG5cbiAgICBiYWxsLnVzZXJEYXRhLmZsb2F0WSA9ICh0aGlzLmRhdGEucmFkaXVzID4gMS41ID8gdGhpcy5kYXRhLnJhZGl1cyArIDAuMSA6IDEuNik7XG4gICAgYmFsbC51c2VyRGF0YS5zZWxlY3RlZCA9IDA7XG4gICAgYmFsbC51c2VyRGF0YS50aW1lT2Zmc2V0ID0gKE1hdGgucmFuZG9tKCkrMC41KSAqIDEwXG4gICAgdGhpcy5iYWxsID0gYmFsbFxuICAgIHRoaXMuZWwuc2V0T2JqZWN0M0QoXCJiYWxsXCIsIGJhbGwpXG5cbiAgICAvL3RoaXMubWVzaC5nZW9tZXRyeS5zY2FsZSgyLCAyLCAyKVxuICAgIHRoaXMubWVzaC5tYXRlcmlhbC5zZXRWYWx1ZXMoe1xuICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICBkZXB0aFRlc3Q6IGZhbHNlLFxuICAgIH0pXG4gICAgdGhpcy5tZXNoLnZpc2libGUgPSBmYWxzZVxuICAgIFxuICAgIHRoaXMubmVhciA9IHRoaXMuZGF0YS5yYWRpdXMgLSAwO1xuICAgIHRoaXMuZmFyID0gdGhpcy5kYXRhLnJhZGl1cyArIDAuMDU7XG5cbiAgICAvLyBSZW5kZXIgT1ZFUiB0aGUgc2NlbmUgYnV0IFVOREVSIHRoZSBjdXJzb3JcbiAgICB0aGlzLm1lc2gucmVuZGVyT3JkZXIgPSBBUFAuUkVOREVSX09SREVSLkNVUlNPUiAtIDAuMVxuICB9LFxuICByZW1vdmU6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFsbC5nZW9tZXRyeS5kaXNwb3NlKClcbiAgICB0aGlzLmJhbGwuZ2VvbWV0cnkgPSBudWxsXG4gICAgdGhpcy5iYWxsLm1hdGVyaWFsLmRpc3Bvc2UoKVxuICAgIHRoaXMuYmFsbC5tYXRlcmlhbCA9IG51bGxcbiAgICB0aGlzLmVsLnJlbW92ZU9iamVjdDNEKFwiYmFsbFwiKVxuICAgIHRoaXMuYmFsbCA9IG51bGxcbiAgfSxcbiAgdGljazogZnVuY3Rpb24gKHRpbWUpIHtcbiAgICBpZiAodGhpcy5tZXNoICYmIGJhbGxUZXgpIHtcbiAgICAgIGxldCBvZmZzZXQgPSBNYXRoLmNvcygodGltZSArIHRoaXMuYmFsbC51c2VyRGF0YS50aW1lT2Zmc2V0KS8xMDAwICogMyApICogMC4wMjtcbiAgICAgIHRoaXMuYmFsbC5wb3NpdGlvbi55ID0gdGhpcy5iYWxsLnVzZXJEYXRhLmZsb2F0WSArIG9mZnNldFxuICAgICAgdGhpcy5iYWxsLm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcblxuICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLnVuaWZvcm1zLnRleGZ4LnZhbHVlID0gYmFsbFRleFxuICAgICAgdGhpcy5iYWxsLm1hdGVyaWFsLnVuaWZvcm1zLmJhbGxUaW1lLnZhbHVlID0gdGltZSAqIDAuMDAxICsgdGhpcy5iYWxsLnVzZXJEYXRhLnRpbWVPZmZzZXRcbiAgICAgIC8vIExpbmVhcmx5IG1hcCBjYW1lcmEgZGlzdGFuY2UgdG8gbWF0ZXJpYWwgb3BhY2l0eVxuICAgICAgdGhpcy5iYWxsLmdldFdvcmxkUG9zaXRpb24od29ybGRTZWxmKVxuICAgICAgdGhpcy5lbC5zY2VuZUVsLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkQ2FtZXJhKVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSB3b3JsZFNlbGYuZGlzdGFuY2VUbyh3b3JsZENhbWVyYSlcbiAgICAgIGNvbnN0IG9wYWNpdHkgPSAxIC0gKGRpc3RhbmNlIC0gdGhpcy5uZWFyKSAvICh0aGlzLmZhciAtIHRoaXMubmVhcilcbiAgICAgIGlmIChvcGFjaXR5IDwgMCkge1xuICAgICAgICAgIC8vIGZhciBhd2F5XG4gICAgICAgICAgdGhpcy5tZXNoLnZpc2libGUgPSBmYWxzZVxuICAgICAgICAgIHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID0gMVxuICAgICAgICAgIHRoaXMuYmFsbC5tYXRlcmlhbC5vcGFjaXR5ID0gMVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMubWVzaC5tYXRlcmlhbC5vcGFjaXR5ID0gb3BhY2l0eSA+IDEgPyAxIDogb3BhY2l0eVxuICAgICAgICAgIHRoaXMubWVzaC52aXNpYmxlID0gdHJ1ZVxuICAgICAgICAgIHRoaXMuYmFsbC5tYXRlcmlhbC5vcGFjaXR5ID0gdGhpcy5tZXNoLm1hdGVyaWFsLm9wYWNpdHlcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBwb3NpdGlvbiB0aGUgbWVzaCBhcm91bmQgdXNlciB1bnRpbCB0aGV5IGxlYXZlIHRoZSBiYWxsXG4gICAgICAgICAgLy8gdGhpcy5lbC5vYmplY3QzRC53b3JsZFRvTG9jYWwod29ybGRDYW1lcmEpXG4gICAgICAgICAgLy8gdGhpcy5tZXNoLnBvc2l0aW9uLmNvcHkod29ybGRDYW1lcmEpXG4gICAgICAgICAgXG4gICAgICAgICAgLy8gdGhpcy5lbC5vYmplY3QzRC5nZXRXb3JsZFBvc2l0aW9uKHdvcmxkU2VsZilcbiAgICAgICAgICAvLyB3b3JsZFNlbGYueSArPSB0aGlzLmJhbGwudXNlckRhdGEuZmxvYXRZO1xuXG4gICAgICAgICAgLy8gd29ybGRTZWxmLnN1Yih3b3JsZENhbWVyYSlcbiAgICAgICAgICAvLyB0aGlzLm1lc2gucG9zaXRpb24uY29weSh3b3JsZFNlbGYpXG4gICAgICAgICAgdGhpcy5zeXN0ZW0udXBkYXRlUG9zaXRpb24odGhpcyk7XG4gICAgICAgIH1cbiAgICB9XG4gIH0sXG4gIHBhcnNlU3Bva2VOYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgLy8gQWNjZXB0ZWQgbmFtZXM6IFwibGFiZWxfX2ltYWdlLWhhc2hfZXh0XCIgT1IgXCJpbWFnZS1oYXNoX2V4dFwiXG4gICAgY29uc3Qgc3Bva2VOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcbiAgICBjb25zdCBtYXRjaGVzID0gc3Bva2VOYW1lLm1hdGNoKC8oPzouKl9fKT8oLiopXyguKikvKVxuICAgIGlmICghbWF0Y2hlcyB8fCBtYXRjaGVzLmxlbmd0aCA8IDMpIHsgcmV0dXJuIFwiXCIgfVxuICAgIGNvbnN0IFssIGhhc2gsIGV4dGVuc2lvbl0gID0gbWF0Y2hlc1xuICAgIGNvbnN0IHVybCA9IGBodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC9kYXRhLyR7aGFzaH0uJHtleHRlbnNpb259YFxuICAgIHJldHVybiB1cmxcbiAgfSxcbiAgZ2V0TWVzaDogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgY29uc3QgbWVzaCA9IHRoaXMucGFuby5vYmplY3QzRE1hcC5tZXNoXG4gICAgICBpZiAobWVzaCkgcmVzb2x2ZShtZXNoKVxuICAgICAgdGhpcy5wYW5vLmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICdpbWFnZS1sb2FkZWQnLFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImltbWVyc2l2ZS0zNjAgcGFubyBsb2FkZWQ6IFwiICsgdGhpcy5kYXRhLnVybClcbiAgICAgICAgICByZXNvbHZlKHRoaXMucGFuby5vYmplY3QzRE1hcC5tZXNoKVxuICAgICAgICB9LFxuICAgICAgICB7IG9uY2U6IHRydWUgfVxuICAgICAgKVxuICAgIH0pXG4gIH0sXG59KVxuIiwiLy8gUGFyYWxsYXggT2NjbHVzaW9uIHNoYWRlcnMgZnJvbVxuLy8gICAgaHR0cDovL3N1bmFuZGJsYWNrY2F0LmNvbS90aXBGdWxsVmlldy5waHA/dG9waWNpZD0yOFxuLy8gTm8gdGFuZ2VudC1zcGFjZSB0cmFuc2Zvcm1zIGxvZ2ljIGJhc2VkIG9uXG4vLyAgIGh0dHA6Ly9tbWlra2Vsc2VuM2QuYmxvZ3Nwb3Quc2svMjAxMi8wMi9wYXJhbGxheHBvYy1tYXBwaW5nLWFuZC1uby10YW5nZW50Lmh0bWxcblxuLy8gSWRlbnRpdHkgZnVuY3Rpb24gZm9yIGdsc2wtbGl0ZXJhbCBoaWdobGlnaHRpbmcgaW4gVlMgQ29kZVxuY29uc3QgZ2xzbCA9IFN0cmluZy5yYXdcblxuY29uc3QgUGFyYWxsYXhTaGFkZXIgPSB7XG4gIC8vIE9yZGVyZWQgZnJvbSBmYXN0ZXN0IHRvIGJlc3QgcXVhbGl0eS5cbiAgbW9kZXM6IHtcbiAgICBub25lOiAnTk9fUEFSQUxMQVgnLFxuICAgIGJhc2ljOiAnVVNFX0JBU0lDX1BBUkFMTEFYJyxcbiAgICBzdGVlcDogJ1VTRV9TVEVFUF9QQVJBTExBWCcsXG4gICAgb2NjbHVzaW9uOiAnVVNFX09DTFVTSU9OX1BBUkFMTEFYJywgLy8gYS5rLmEuIFBPTVxuICAgIHJlbGllZjogJ1VTRV9SRUxJRUZfUEFSQUxMQVgnLFxuICB9LFxuXG4gIHVuaWZvcm1zOiB7XG4gICAgYnVtcE1hcDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIG1hcDogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4U2NhbGU6IHsgdmFsdWU6IG51bGwgfSxcbiAgICBwYXJhbGxheE1pbkxheWVyczogeyB2YWx1ZTogbnVsbCB9LFxuICAgIHBhcmFsbGF4TWF4TGF5ZXJzOiB7IHZhbHVlOiBudWxsIH0sXG4gIH0sXG5cbiAgdmVydGV4U2hhZGVyOiBnbHNsYFxuICAgIHZhcnlpbmcgdmVjMiB2VXY7XG4gICAgdmFyeWluZyB2ZWMzIHZWaWV3UG9zaXRpb247XG4gICAgdmFyeWluZyB2ZWMzIHZOb3JtYWw7XG5cbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICB2VXYgPSB1djtcbiAgICAgIHZlYzQgbXZQb3NpdGlvbiA9IG1vZGVsVmlld01hdHJpeCAqIHZlYzQoIHBvc2l0aW9uLCAxLjAgKTtcbiAgICAgIHZWaWV3UG9zaXRpb24gPSAtbXZQb3NpdGlvbi54eXo7XG4gICAgICB2Tm9ybWFsID0gbm9ybWFsaXplKCBub3JtYWxNYXRyaXggKiBub3JtYWwgKTtcbiAgICAgIFxuICAgICAgZ2xfUG9zaXRpb24gPSBwcm9qZWN0aW9uTWF0cml4ICogbXZQb3NpdGlvbjtcbiAgICB9XG4gIGAsXG5cbiAgZnJhZ21lbnRTaGFkZXI6IGdsc2xgXG4gICAgdW5pZm9ybSBzYW1wbGVyMkQgYnVtcE1hcDtcbiAgICB1bmlmb3JtIHNhbXBsZXIyRCBtYXA7XG5cbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4U2NhbGU7XG4gICAgdW5pZm9ybSBmbG9hdCBwYXJhbGxheE1pbkxheWVycztcbiAgICB1bmlmb3JtIGZsb2F0IHBhcmFsbGF4TWF4TGF5ZXJzO1xuICAgIHVuaWZvcm0gZmxvYXQgZmFkZTsgLy8gQ1VTVE9NXG5cbiAgICB2YXJ5aW5nIHZlYzIgdlV2O1xuICAgIHZhcnlpbmcgdmVjMyB2Vmlld1Bvc2l0aW9uO1xuICAgIHZhcnlpbmcgdmVjMyB2Tm9ybWFsO1xuXG4gICAgI2lmZGVmIFVTRV9CQVNJQ19QQVJBTExBWFxuXG4gICAgdmVjMiBwYXJhbGxheE1hcChpbiB2ZWMzIFYpIHtcbiAgICAgIGZsb2F0IGluaXRpYWxIZWlnaHQgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgdlV2KS5yO1xuXG4gICAgICAvLyBObyBPZmZzZXQgTGltaXR0aW5nOiBtZXNzeSwgZmxvYXRpbmcgb3V0cHV0IGF0IGdyYXppbmcgYW5nbGVzLlxuICAgICAgLy9cInZlYzIgdGV4Q29vcmRPZmZzZXQgPSBwYXJhbGxheFNjYWxlICogVi54eSAvIFYueiAqIGluaXRpYWxIZWlnaHQ7XCIsXG5cbiAgICAgIC8vIE9mZnNldCBMaW1pdGluZ1xuICAgICAgdmVjMiB0ZXhDb29yZE9mZnNldCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5ICogaW5pdGlhbEhlaWdodDtcbiAgICAgIHJldHVybiB2VXYgLSB0ZXhDb29yZE9mZnNldDtcbiAgICB9XG5cbiAgICAjZWxzZVxuXG4gICAgdmVjMiBwYXJhbGxheE1hcChpbiB2ZWMzIFYpIHtcbiAgICAgIC8vIERldGVybWluZSBudW1iZXIgb2YgbGF5ZXJzIGZyb20gYW5nbGUgYmV0d2VlbiBWIGFuZCBOXG4gICAgICBmbG9hdCBudW1MYXllcnMgPSBtaXgocGFyYWxsYXhNYXhMYXllcnMsIHBhcmFsbGF4TWluTGF5ZXJzLCBhYnMoZG90KHZlYzMoMC4wLCAwLjAsIDEuMCksIFYpKSk7XG5cbiAgICAgIGZsb2F0IGxheWVySGVpZ2h0ID0gMS4wIC8gbnVtTGF5ZXJzO1xuICAgICAgZmxvYXQgY3VycmVudExheWVySGVpZ2h0ID0gMC4wO1xuICAgICAgLy8gU2hpZnQgb2YgdGV4dHVyZSBjb29yZGluYXRlcyBmb3IgZWFjaCBpdGVyYXRpb25cbiAgICAgIHZlYzIgZHRleCA9IHBhcmFsbGF4U2NhbGUgKiBWLnh5IC8gVi56IC8gbnVtTGF5ZXJzO1xuXG4gICAgICB2ZWMyIGN1cnJlbnRUZXh0dXJlQ29vcmRzID0gdlV2O1xuXG4gICAgICBmbG9hdCBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcblxuICAgICAgLy8gd2hpbGUgKCBoZWlnaHRGcm9tVGV4dHVyZSA+IGN1cnJlbnRMYXllckhlaWdodCApXG4gICAgICAvLyBJbmZpbml0ZSBsb29wcyBhcmUgbm90IHdlbGwgc3VwcG9ydGVkLiBEbyBhIFwibGFyZ2VcIiBmaW5pdGVcbiAgICAgIC8vIGxvb3AsIGJ1dCBub3QgdG9vIGxhcmdlLCBhcyBpdCBzbG93cyBkb3duIHNvbWUgY29tcGlsZXJzLlxuICAgICAgZm9yIChpbnQgaSA9IDA7IGkgPCAzMDsgaSArPSAxKSB7XG4gICAgICAgIGlmIChoZWlnaHRGcm9tVGV4dHVyZSA8PSBjdXJyZW50TGF5ZXJIZWlnaHQpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgKz0gbGF5ZXJIZWlnaHQ7XG4gICAgICAgIC8vIFNoaWZ0IHRleHR1cmUgY29vcmRpbmF0ZXMgYWxvbmcgdmVjdG9yIFZcbiAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgLT0gZHRleDtcbiAgICAgICAgaGVpZ2h0RnJvbVRleHR1cmUgPSB0ZXh0dXJlMkQoYnVtcE1hcCwgY3VycmVudFRleHR1cmVDb29yZHMpLnI7XG4gICAgICB9XG5cbiAgICAgICNpZmRlZiBVU0VfU1RFRVBfUEFSQUxMQVhcblxuICAgICAgcmV0dXJuIGN1cnJlbnRUZXh0dXJlQ29vcmRzO1xuXG4gICAgICAjZWxpZiBkZWZpbmVkKFVTRV9SRUxJRUZfUEFSQUxMQVgpXG5cbiAgICAgIHZlYzIgZGVsdGFUZXhDb29yZCA9IGR0ZXggLyAyLjA7XG4gICAgICBmbG9hdCBkZWx0YUhlaWdodCA9IGxheWVySGVpZ2h0IC8gMi4wO1xuXG4gICAgICAvLyBSZXR1cm4gdG8gdGhlIG1pZCBwb2ludCBvZiBwcmV2aW91cyBsYXllclxuICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgKz0gZGVsdGFUZXhDb29yZDtcbiAgICAgIGN1cnJlbnRMYXllckhlaWdodCAtPSBkZWx0YUhlaWdodDtcblxuICAgICAgLy8gQmluYXJ5IHNlYXJjaCB0byBpbmNyZWFzZSBwcmVjaXNpb24gb2YgU3RlZXAgUGFyYWxsYXggTWFwcGluZ1xuICAgICAgY29uc3QgaW50IG51bVNlYXJjaGVzID0gNTtcbiAgICAgIGZvciAoaW50IGkgPSAwOyBpIDwgbnVtU2VhcmNoZXM7IGkgKz0gMSkge1xuICAgICAgICBkZWx0YVRleENvb3JkIC89IDIuMDtcbiAgICAgICAgZGVsdGFIZWlnaHQgLz0gMi4wO1xuICAgICAgICBoZWlnaHRGcm9tVGV4dHVyZSA9IHRleHR1cmUyRChidW1wTWFwLCBjdXJyZW50VGV4dHVyZUNvb3JkcykucjtcbiAgICAgICAgLy8gU2hpZnQgYWxvbmcgb3IgYWdhaW5zdCB2ZWN0b3IgVlxuICAgICAgICBpZiAoaGVpZ2h0RnJvbVRleHR1cmUgPiBjdXJyZW50TGF5ZXJIZWlnaHQpIHtcbiAgICAgICAgICAvLyBCZWxvdyB0aGUgc3VyZmFjZVxuXG4gICAgICAgICAgY3VycmVudFRleHR1cmVDb29yZHMgLT0gZGVsdGFUZXhDb29yZDtcbiAgICAgICAgICBjdXJyZW50TGF5ZXJIZWlnaHQgKz0gZGVsdGFIZWlnaHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gYWJvdmUgdGhlIHN1cmZhY2VcblxuICAgICAgICAgIGN1cnJlbnRUZXh0dXJlQ29vcmRzICs9IGRlbHRhVGV4Q29vcmQ7XG4gICAgICAgICAgY3VycmVudExheWVySGVpZ2h0IC09IGRlbHRhSGVpZ2h0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gY3VycmVudFRleHR1cmVDb29yZHM7XG5cbiAgICAgICNlbGlmIGRlZmluZWQoVVNFX09DTFVTSU9OX1BBUkFMTEFYKVxuXG4gICAgICB2ZWMyIHByZXZUQ29vcmRzID0gY3VycmVudFRleHR1cmVDb29yZHMgKyBkdGV4O1xuXG4gICAgICAvLyBIZWlnaHRzIGZvciBsaW5lYXIgaW50ZXJwb2xhdGlvblxuICAgICAgZmxvYXQgbmV4dEggPSBoZWlnaHRGcm9tVGV4dHVyZSAtIGN1cnJlbnRMYXllckhlaWdodDtcbiAgICAgIGZsb2F0IHByZXZIID0gdGV4dHVyZTJEKGJ1bXBNYXAsIHByZXZUQ29vcmRzKS5yIC0gY3VycmVudExheWVySGVpZ2h0ICsgbGF5ZXJIZWlnaHQ7XG5cbiAgICAgIC8vIFByb3BvcnRpb25zIGZvciBsaW5lYXIgaW50ZXJwb2xhdGlvblxuICAgICAgZmxvYXQgd2VpZ2h0ID0gbmV4dEggLyAobmV4dEggLSBwcmV2SCk7XG5cbiAgICAgIC8vIEludGVycG9sYXRpb24gb2YgdGV4dHVyZSBjb29yZGluYXRlc1xuICAgICAgcmV0dXJuIHByZXZUQ29vcmRzICogd2VpZ2h0ICsgY3VycmVudFRleHR1cmVDb29yZHMgKiAoMS4wIC0gd2VpZ2h0KTtcblxuICAgICAgI2Vsc2UgLy8gTk9fUEFSQUxMQVhcblxuICAgICAgcmV0dXJuIHZVdjtcblxuICAgICAgI2VuZGlmXG4gICAgfVxuICAgICNlbmRpZlxuXG4gICAgdmVjMiBwZXJ0dXJiVXYodmVjMyBzdXJmUG9zaXRpb24sIHZlYzMgc3VyZk5vcm1hbCwgdmVjMyB2aWV3UG9zaXRpb24pIHtcbiAgICAgIHZlYzIgdGV4RHggPSBkRmR4KHZVdik7XG4gICAgICB2ZWMyIHRleER5ID0gZEZkeSh2VXYpO1xuXG4gICAgICB2ZWMzIHZTaWdtYVggPSBkRmR4KHN1cmZQb3NpdGlvbik7XG4gICAgICB2ZWMzIHZTaWdtYVkgPSBkRmR5KHN1cmZQb3NpdGlvbik7XG4gICAgICB2ZWMzIHZSMSA9IGNyb3NzKHZTaWdtYVksIHN1cmZOb3JtYWwpO1xuICAgICAgdmVjMyB2UjIgPSBjcm9zcyhzdXJmTm9ybWFsLCB2U2lnbWFYKTtcbiAgICAgIGZsb2F0IGZEZXQgPSBkb3QodlNpZ21hWCwgdlIxKTtcblxuICAgICAgdmVjMiB2UHJvalZzY3IgPSAoMS4wIC8gZkRldCkgKiB2ZWMyKGRvdCh2UjEsIHZpZXdQb3NpdGlvbiksIGRvdCh2UjIsIHZpZXdQb3NpdGlvbikpO1xuICAgICAgdmVjMyB2UHJvalZ0ZXg7XG4gICAgICB2UHJvalZ0ZXgueHkgPSB0ZXhEeCAqIHZQcm9qVnNjci54ICsgdGV4RHkgKiB2UHJvalZzY3IueTtcbiAgICAgIHZQcm9qVnRleC56ID0gZG90KHN1cmZOb3JtYWwsIHZpZXdQb3NpdGlvbik7XG5cbiAgICAgIHJldHVybiBwYXJhbGxheE1hcCh2UHJvalZ0ZXgpO1xuICAgIH1cblxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIHZlYzIgbWFwVXYgPSBwZXJ0dXJiVXYoLXZWaWV3UG9zaXRpb24sIG5vcm1hbGl6ZSh2Tm9ybWFsKSwgbm9ybWFsaXplKHZWaWV3UG9zaXRpb24pKTtcbiAgICAgIFxuICAgICAgLy8gQ1VTVE9NIFNUQVJUXG4gICAgICB2ZWM0IHRleGVsID0gdGV4dHVyZTJEKG1hcCwgbWFwVXYpO1xuICAgICAgdmVjMyBjb2xvciA9IG1peCh0ZXhlbC54eXosIHZlYzMoMCksIGZhZGUpO1xuICAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2xvciwgMS4wKTtcbiAgICAgIC8vIENVU1RPTSBFTkRcbiAgICB9XG5cbiAgYCxcbn1cblxuZXhwb3J0IHsgUGFyYWxsYXhTaGFkZXIgfVxuIiwiLyoqXG4gKiBEZXNjcmlwdGlvblxuICogPT09PT09PT09PT1cbiAqIENyZWF0ZSB0aGUgaWxsdXNpb24gb2YgZGVwdGggaW4gYSBjb2xvciBpbWFnZSBmcm9tIGEgZGVwdGggbWFwXG4gKlxuICogVXNhZ2VcbiAqID09PT09XG4gKiBDcmVhdGUgYSBwbGFuZSBpbiBCbGVuZGVyIGFuZCBnaXZlIGl0IGEgbWF0ZXJpYWwgKGp1c3QgdGhlIGRlZmF1bHQgUHJpbmNpcGxlZCBCU0RGKS5cbiAqIEFzc2lnbiBjb2xvciBpbWFnZSB0byBcImNvbG9yXCIgY2hhbm5lbCBhbmQgZGVwdGggbWFwIHRvIFwiZW1pc3NpdmVcIiBjaGFubmVsLlxuICogWW91IG1heSB3YW50IHRvIHNldCBlbWlzc2l2ZSBzdHJlbmd0aCB0byB6ZXJvIHNvIHRoZSBwcmV2aWV3IGxvb2tzIGJldHRlci5cbiAqIEFkZCB0aGUgXCJwYXJhbGxheFwiIGNvbXBvbmVudCBmcm9tIHRoZSBIdWJzIGV4dGVuc2lvbiwgY29uZmlndXJlLCBhbmQgZXhwb3J0IGFzIC5nbGJcbiAqL1xuXG5pbXBvcnQgeyBQYXJhbGxheFNoYWRlciB9IGZyb20gJy4uL3NoYWRlcnMvcGFyYWxsYXgtc2hhZGVyLmpzJ1xuXG5jb25zdCB2ZWMgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCBmb3J3YXJkID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdwYXJhbGxheCcsIHtcbiAgc2NoZW1hOiB7XG4gICAgc3RyZW5ndGg6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDAuNSB9LFxuICAgIGN1dG9mZlRyYW5zaXRpb246IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IE1hdGguUEkgLyA4IH0sXG4gICAgY3V0b2ZmQW5nbGU6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IE1hdGguUEkgLyA0IH0sXG4gIH0sXG4gIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcC5tZXNoXG4gICAgY29uc3QgeyBtYXA6IGNvbG9yTWFwLCBlbWlzc2l2ZU1hcDogZGVwdGhNYXAgfSA9IG1lc2gubWF0ZXJpYWxcbiAgICBjb2xvck1hcC53cmFwUyA9IGNvbG9yTWFwLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZ1xuICAgIGRlcHRoTWFwLndyYXBTID0gZGVwdGhNYXAud3JhcFQgPSBUSFJFRS5DbGFtcFRvRWRnZVdyYXBwaW5nXG4gICAgY29uc3QgeyB2ZXJ0ZXhTaGFkZXIsIGZyYWdtZW50U2hhZGVyIH0gPSBQYXJhbGxheFNoYWRlclxuICAgIHRoaXMubWF0ZXJpYWwgPSBuZXcgVEhSRUUuU2hhZGVyTWF0ZXJpYWwoe1xuICAgICAgdmVydGV4U2hhZGVyLFxuICAgICAgZnJhZ21lbnRTaGFkZXIsXG4gICAgICBkZWZpbmVzOiB7IFVTRV9PQ0xVU0lPTl9QQVJBTExBWDogdHJ1ZSB9LFxuICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgbWFwOiB7IHZhbHVlOiBjb2xvck1hcCB9LFxuICAgICAgICBidW1wTWFwOiB7IHZhbHVlOiBkZXB0aE1hcCB9LFxuICAgICAgICBwYXJhbGxheFNjYWxlOiB7IHZhbHVlOiAtMSAqIHRoaXMuZGF0YS5zdHJlbmd0aCB9LFxuICAgICAgICBwYXJhbGxheE1pbkxheWVyczogeyB2YWx1ZTogMjAgfSxcbiAgICAgICAgcGFyYWxsYXhNYXhMYXllcnM6IHsgdmFsdWU6IDMwIH0sXG4gICAgICAgIGZhZGU6IHsgdmFsdWU6IDAgfSxcbiAgICAgIH0sXG4gICAgfSlcbiAgICBtZXNoLm1hdGVyaWFsID0gdGhpcy5tYXRlcmlhbFxuICB9LFxuICB0aWNrKCkge1xuICAgIGlmICh0aGlzLmVsLnNjZW5lRWwuY2FtZXJhKSB7XG4gICAgICB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24odmVjKVxuICAgICAgdGhpcy5lbC5vYmplY3QzRC53b3JsZFRvTG9jYWwodmVjKVxuICAgICAgY29uc3QgYW5nbGUgPSB2ZWMuYW5nbGVUbyhmb3J3YXJkKVxuICAgICAgY29uc3QgZmFkZSA9IG1hcExpbmVhckNsYW1wZWQoXG4gICAgICAgIGFuZ2xlLFxuICAgICAgICB0aGlzLmRhdGEuY3V0b2ZmQW5nbGUgLSB0aGlzLmRhdGEuY3V0b2ZmVHJhbnNpdGlvbixcbiAgICAgICAgdGhpcy5kYXRhLmN1dG9mZkFuZ2xlICsgdGhpcy5kYXRhLmN1dG9mZlRyYW5zaXRpb24sXG4gICAgICAgIDAsIC8vIEluIHZpZXcgem9uZSwgbm8gZmFkZVxuICAgICAgICAxIC8vIE91dHNpZGUgdmlldyB6b25lLCBmdWxsIGZhZGVcbiAgICAgIClcbiAgICAgIHRoaXMubWF0ZXJpYWwudW5pZm9ybXMuZmFkZS52YWx1ZSA9IGZhZGVcbiAgICB9XG4gIH0sXG59KVxuXG5mdW5jdGlvbiBjbGFtcCh2YWx1ZSwgbWluLCBtYXgpIHtcbiAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpXG59XG5cbmZ1bmN0aW9uIG1hcExpbmVhcih4LCBhMSwgYTIsIGIxLCBiMikge1xuICByZXR1cm4gYjEgKyAoKHggLSBhMSkgKiAoYjIgLSBiMSkpIC8gKGEyIC0gYTEpXG59XG5cbmZ1bmN0aW9uIG1hcExpbmVhckNsYW1wZWQoeCwgYTEsIGEyLCBiMSwgYjIpIHtcbiAgcmV0dXJuIGNsYW1wKG1hcExpbmVhcih4LCBhMSwgYTIsIGIxLCBiMiksIGIxLCBiMilcbn1cbiIsImV4cG9ydCBkZWZhdWx0IFwiaHR0cHM6Ly93aWxsaWFtY2FzZXlsdWNhcy5naXRodWIuaW8vY29yZS1jb21wb25lbnRzL2Y5OGI5NmZlM2UwNmVhMjAucG5nXCIiLCIvKipcbiAqIERlc2NyaXB0aW9uXG4gKiA9PT09PT09PT09PVxuICogY3JlYXRlIGEgSFRNTCBvYmplY3QgYnkgcmVuZGVyaW5nIGEgc2NyaXB0IHRoYXQgY3JlYXRlcyBhbmQgbWFuYWdlcyBpdFxuICpcbiAqL1xuaW1wb3J0IHsgZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCB9IGZyb20gXCIuLi91dGlscy9zY2VuZS1ncmFwaFwiO1xuaW1wb3J0IHt2dWVDb21wb25lbnRzIGFzIGh0bWxDb21wb25lbnRzfSBmcm9tIFwiaHR0cHM6Ly9yZXNvdXJjZXMucmVhbGl0eW1lZGlhLmRpZ2l0YWwvdnVlLWFwcHMvZGlzdC9odWJzLmpzXCI7XG5pbXBvcnQgc3Bpbm5lckltYWdlIGZyb20gXCIuLi9hc3NldHMvU3Bpbm5lci0xcy0yMDBweC5wbmdcIlxuXG4vLyBsb2FkIGFuZCBzZXR1cCBhbGwgdGhlIGJpdHMgb2YgdGhlIHRleHR1cmVzIGZvciB0aGUgZG9vclxuY29uc3QgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKVxuY29uc3Qgc3Bpbm5lckdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkoIDEsIDEgKTtcbmNvbnN0IHNwaW5uZXJNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XG4gICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgYWxwaGFUZXN0OiAwLjFcbn0pXG5cbmxvYWRlci5sb2FkKHNwaW5uZXJJbWFnZSwgKGNvbG9yKSA9PiB7XG4gICAgc3Bpbm5lck1hdGVyaWFsLm1hcCA9IGNvbG9yO1xuICAgIHNwaW5uZXJNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWVcbn0pXG5cbi8vIHZhciBodG1sQ29tcG9uZW50cztcbi8vIHZhciBzY3JpcHRQcm9taXNlO1xuLy8gaWYgKHdpbmRvdy5fX3Rlc3RpbmdWdWVBcHBzKSB7XG4vLyAgICAgc2NyaXB0UHJvbWlzZSA9IGltcG9ydCh3aW5kb3cuX190ZXN0aW5nVnVlQXBwcykgICAgXG4vLyB9IGVsc2Uge1xuLy8gICAgIHNjcmlwdFByb21pc2UgPSBpbXBvcnQoXCJodHRwczovL3Jlc291cmNlcy5yZWFsaXR5bWVkaWEuZGlnaXRhbC92dWUtYXBwcy9kaXN0L2h1YnMuanNcIikgXG4vLyB9XG4vLyAvLyBzY3JpcHRQcm9taXNlID0gc2NyaXB0UHJvbWlzZS50aGVuKG1vZHVsZSA9PiB7XG4vLyAvLyAgICAgcmV0dXJuIG1vZHVsZVxuLy8gLy8gfSk7XG4vKipcbiAqIE1vZGlmaWVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21vemlsbGEvaHVicy9ibG9iL21hc3Rlci9zcmMvY29tcG9uZW50cy9mYWRlci5qc1xuICogdG8gaW5jbHVkZSBhZGp1c3RhYmxlIGR1cmF0aW9uIGFuZCBjb252ZXJ0ZWQgZnJvbSBjb21wb25lbnQgdG8gc3lzdGVtXG4gKi9cblxuIEFGUkFNRS5yZWdpc3RlclN5c3RlbSgnaHRtbC1zY3JpcHQnLCB7ICBcbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLnN5c3RlbVRpY2sgPSBodG1sQ29tcG9uZW50c1tcInN5c3RlbVRpY2tcIl07XG4gICAgICAgIHRoaXMuaW5pdGlhbGl6ZUV0aGVyZWFsID0gaHRtbENvbXBvbmVudHNbXCJpbml0aWFsaXplRXRoZXJlYWxcIl1cbiAgICAgICAgaWYgKCF0aGlzLnN5c3RlbVRpY2sgfHwgIXRoaXMuaW5pdGlhbGl6ZUV0aGVyZWFsKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiZXJyb3IgaW4gaHRtbC1zY3JpcHQgc3lzdGVtOiBodG1sQ29tcG9uZW50cyBoYXMgbm8gc3lzdGVtVGljayBhbmQvb3IgaW5pdGlhbGl6ZUV0aGVyZWFsIG1ldGhvZHNcIilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZUV0aGVyZWFsKClcbiAgICAgICAgfVxuICAgIH0sXG4gIFxuICAgIHRpY2sodCwgZHQpIHtcbiAgICAgICAgdGhpcy5zeXN0ZW1UaWNrKHQsIGR0KVxuICAgIH0sXG4gIH0pXG4gIFxuY29uc3Qgb25jZSA9IHtcbiAgICBvbmNlIDogdHJ1ZVxufTtcbiAgXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ2h0bWwtc2NyaXB0Jywge1xuICAgIHNjaGVtYToge1xuICAgICAgICAvLyBuYW1lIG11c3QgZm9sbG93IHRoZSBwYXR0ZXJuIFwiKl9jb21wb25lbnROYW1lXCJcbiAgICAgICAgbmFtZTogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcIlwifSxcbiAgICAgICAgd2lkdGg6IHsgdHlwZTogXCJudW1iZXJcIiwgZGVmYXVsdDogLTF9LFxuICAgICAgICBoZWlnaHQ6IHsgdHlwZTogXCJudW1iZXJcIiwgZGVmYXVsdDogLTF9LFxuICAgICAgICBwYXJhbWV0ZXIxOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgICAgICBwYXJhbWV0ZXIyOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgICAgICBwYXJhbWV0ZXIzOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgICAgICBwYXJhbWV0ZXI0OiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwiXCJ9LFxuICAgIH0sXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnNjcmlwdCA9IG51bGw7XG4gICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmRhdGEubmFtZTtcblxuICAgICAgICB0aGlzLnNjcmlwdERhdGEgPSB7XG4gICAgICAgICAgICB3aWR0aDogdGhpcy5kYXRhLndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLmRhdGEuaGVpZ2h0LFxuICAgICAgICAgICAgcGFyYW1ldGVyMTogdGhpcy5kYXRhLnBhcmFtZXRlcjEsXG4gICAgICAgICAgICBwYXJhbWV0ZXIyOiB0aGlzLmRhdGEucGFyYW1ldGVyMixcbiAgICAgICAgICAgIHBhcmFtZXRlcjM6IHRoaXMuZGF0YS5wYXJhbWV0ZXIzLFxuICAgICAgICAgICAgcGFyYW1ldGVyNDogdGhpcy5kYXRhLnBhcmFtZXRlcjRcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubG9hZGluZyA9IHRydWU7XG4gICAgICAgIHRoaXMuc3Bpbm5lclBsYW5lID0gbmV3IFRIUkVFLk1lc2goIHNwaW5uZXJHZW9tZXRyeSwgc3Bpbm5lck1hdGVyaWFsICk7XG4gICAgICAgIHRoaXMuc3Bpbm5lclBsYW5lLm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG4gICAgICAgIHRoaXMuc3Bpbm5lclBsYW5lLnBvc2l0aW9uLnogPSAwLjA1XG4gICAgICAgIGlmICghdGhpcy5mdWxsTmFtZSB8fCB0aGlzLmZ1bGxOYW1lLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHRoaXMuZnVsbE5hbWVcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCByb290ID0gZmluZEFuY2VzdG9yV2l0aENvbXBvbmVudCh0aGlzLmVsLCBcImdsdGYtbW9kZWwtcGx1c1wiKVxuICAgICAgICByb290ICYmIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoZXYpID0+IHsgXG4gICAgICAgICAgICB0aGlzLmNyZWF0ZVNjcmlwdCgpXG4gICAgICAgIH0sIG9uY2UpO1xuXG4gICAgICAgIC8vdGhpcy5jcmVhdGVTY3JpcHQoKTtcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRhdGEubmFtZSA9PT0gXCJcIiB8fCB0aGlzLmRhdGEubmFtZSA9PT0gdGhpcy5mdWxsTmFtZSkgcmV0dXJuXG5cbiAgICAgICAgdGhpcy5mdWxsTmFtZSA9IHRoaXMuZGF0YS5uYW1lO1xuICAgICAgICAvLyB0aGlzLnBhcnNlTm9kZU5hbWUoKTtcbiAgICAgICAgdGhpcy5jb21wb25lbnROYW1lID0gdGhpcy5mdWxsTmFtZTtcbiAgICAgICAgXG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCkge1xuICAgICAgICAgICAgdGhpcy5kZXN0cm95U2NyaXB0KClcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNyZWF0ZVNjcmlwdCgpO1xuICAgIH0sXG5cbiAgICBjcmVhdGVTY3JpcHQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gZWFjaCB0aW1lIHdlIGxvYWQgYSBzY3JpcHQgY29tcG9uZW50IHdlIHdpbGwgcG9zc2libHkgY3JlYXRlXG4gICAgICAgIC8vIGEgbmV3IG5ldHdvcmtlZCBjb21wb25lbnQuICBUaGlzIGlzIGZpbmUsIHNpbmNlIHRoZSBuZXR3b3JrZWQgSWQgXG4gICAgICAgIC8vIGlzIGJhc2VkIG9uIHRoZSBmdWxsIG5hbWUgcGFzc2VkIGFzIGEgcGFyYW1ldGVyLCBvciBhc3NpZ25lZCB0byB0aGVcbiAgICAgICAgLy8gY29tcG9uZW50IGluIFNwb2tlLiAgSXQgZG9lcyBtZWFuIHRoYXQgaWYgd2UgaGF2ZVxuICAgICAgICAvLyBtdWx0aXBsZSBvYmplY3RzIGluIHRoZSBzY2VuZSB3aGljaCBoYXZlIHRoZSBzYW1lIG5hbWUsIHRoZXkgd2lsbFxuICAgICAgICAvLyBiZSBpbiBzeW5jLiAgSXQgYWxzbyBtZWFucyB0aGF0IGlmIHlvdSB3YW50IHRvIGRyb3AgYSBjb21wb25lbnQgb25cbiAgICAgICAgLy8gdGhlIHNjZW5lIHZpYSBhIC5nbGIsIGl0IG11c3QgaGF2ZSBhIHZhbGlkIG5hbWUgcGFyYW1ldGVyIGluc2lkZSBpdC5cbiAgICAgICAgLy8gQSAuZ2xiIGluIHNwb2tlIHdpbGwgZmFsbCBiYWNrIHRvIHRoZSBzcG9rZSBuYW1lIGlmIHlvdSB1c2Ugb25lIHdpdGhvdXRcbiAgICAgICAgLy8gYSBuYW1lIGluc2lkZSBpdC5cbiAgICAgICAgbGV0IGxvYWRlciA9ICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMubG9hZFNjcmlwdCgpLnRoZW4oICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuc2NyaXB0KSByZXR1cm5cblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBnZXQgdGhlIHBhcmVudCBuZXR3b3JrZWQgZW50aXR5LCB3aGVuIGl0J3MgZmluaXNoZWQgaW5pdGlhbGl6aW5nLiAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFdoZW4gY3JlYXRpbmcgdGhpcyBhcyBwYXJ0IG9mIGEgR0xURiBsb2FkLCB0aGUgXG4gICAgICAgICAgICAgICAgICAgIC8vIHBhcmVudCBhIGZldyBzdGVwcyB1cCB3aWxsIGJlIG5ldHdvcmtlZC4gIFdlJ2xsIG9ubHkgZG8gdGhpc1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgSFRNTCBzY3JpcHQgd2FudHMgdG8gYmUgbmV0d29ya2VkXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmV0RW50aXR5ID0gbnVsbFxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGJpbmQgY2FsbGJhY2tzXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2V0U2hhcmVkRGF0YSA9IHRoaXMuZ2V0U2hhcmVkRGF0YS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRha2VPd25lcnNoaXAgPSB0aGlzLnRha2VPd25lcnNoaXAuYmluZCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRTaGFyZWREYXRhID0gdGhpcy5zZXRTaGFyZWREYXRhLmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC5zZXROZXR3b3JrTWV0aG9kcyh0aGlzLnRha2VPd25lcnNoaXAsIHRoaXMuc2V0U2hhcmVkRGF0YSlcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBzZXQgdXAgdGhlIGxvY2FsIGNvbnRlbnQgYW5kIGhvb2sgaXQgdG8gdGhlIHNjZW5lXG4gICAgICAgICAgICAgICAgY29uc3Qgc2NyaXB0RWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhLWVudGl0eScpXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIgPSBzY3JpcHRFbFxuICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLm9iamVjdDNELm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlXG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0T2JqZWN0M0QoXCJ3ZWJsYXllcjNkXCIsIHRoaXMuc2NyaXB0LndlYkxheWVyM0QpXG5cbiAgICAgICAgICAgICAgICAvLyBsZXRzIGZpZ3VyZSBvdXQgdGhlIHNjYWxlLCBidXQgc2NhbGluZyB0byBmaWxsIHRoZSBhIDF4MW0gc3F1YXJlLCB0aGF0IGhhcyBhbHNvXG4gICAgICAgICAgICAgICAgLy8gcG90ZW50aWFsbHkgYmVlbiBzY2FsZWQgYnkgdGhlIHBhcmVudHMgcGFyZW50IG5vZGUuIElmIHdlIHNjYWxlIHRoZSBlbnRpdHkgaW4gc3Bva2UsXG4gICAgICAgICAgICAgICAgLy8gdGhpcyBpcyB3aGVyZSB0aGUgc2NhbGUgaXMgc2V0LiAgSWYgd2UgZHJvcCBhIG5vZGUgaW4gYW5kIHNjYWxlIGl0LCB0aGUgc2NhbGUgaXMgYWxzb1xuICAgICAgICAgICAgICAgIC8vIHNldCB0aGVyZS5cbiAgICAgICAgICAgICAgICAvLyBXZSB1c2VkIHRvIGhhdmUgYSBmaXhlZCBzaXplIHBhc3NlZCBiYWNrIGZyb20gdGhlIGVudGl0eSwgYnV0IHRoYXQncyB0b28gcmVzdHJpY3RpdmU6XG4gICAgICAgICAgICAgICAgLy8gY29uc3Qgd2lkdGggPSB0aGlzLnNjcmlwdC53aWR0aFxuICAgICAgICAgICAgICAgIC8vIGNvbnN0IGhlaWdodCA9IHRoaXMuc2NyaXB0LmhlaWdodFxuXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogbmVlZCB0byBmaW5kIGVudmlyb25tZW50LXNjZW5lLCBnbyBkb3duIHR3byBsZXZlbHMgdG8gdGhlIGdyb3VwIGFib3ZlIFxuICAgICAgICAgICAgICAgIC8vIHRoZSBub2RlcyBpbiB0aGUgc2NlbmUuICBUaGVuIGFjY3VtdWxhdGUgdGhlIHNjYWxlcyB1cCBmcm9tIHRoaXMgbm9kZSB0b1xuICAgICAgICAgICAgICAgIC8vIHRoYXQgbm9kZS4gIFRoaXMgd2lsbCBhY2NvdW50IGZvciBncm91cHMsIGFuZCBuZXN0aW5nLlxuXG4gICAgICAgICAgICAgICAgdmFyIHdpZHRoID0gMSwgaGVpZ2h0ID0gMTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtaW1hZ2VcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYXR0YWNoZWQgdG8gYW4gaW1hZ2UgaW4gc3Bva2UsIHNvIHRoZSBpbWFnZSBtZXNoIGlzIHNpemUgMSBhbmQgaXMgc2NhbGVkIGRpcmVjdGx5XG4gICAgICAgICAgICAgICAgICAgIGxldCBzY2FsZU0gPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXS5zY2FsZVxuICAgICAgICAgICAgICAgICAgICBsZXQgc2NhbGVJID0gdGhpcy5lbC5vYmplY3QzRC5zY2FsZVxuICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IHNjYWxlTS54ICogc2NhbGVJLnhcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gc2NhbGVNLnkgKiBzY2FsZUkueVxuICAgICAgICAgICAgICAgICAgICBzY2FsZUkueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgIHNjYWxlSS56ID0gMVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBpdCdzIGVtYmVkZGVkIGluIGEgc2ltcGxlIGdsdGYgbW9kZWw7ICBvdGhlciBtb2RlbHMgbWF5IG5vdCB3b3JrXG4gICAgICAgICAgICAgICAgICAgIC8vIHdlIGFzc3VtZSBpdCdzIGF0IHRoZSB0b3AgbGV2ZWwgbWVzaCwgYW5kIHRoYXQgdGhlIG1vZGVsIGl0c2VsZiBpcyBzY2FsZWRcbiAgICAgICAgICAgICAgICAgICAgbGV0IG1lc2ggPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXVxuICAgICAgICAgICAgICAgICAgICBpZiAobWVzaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGJveCA9IG1lc2guZ2VvbWV0cnkuYm91bmRpbmdCb3g7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCA9IChib3gubWF4LnggLSBib3gubWluLngpICogbWVzaC5zY2FsZS54XG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQgPSAoYm94Lm1heC55IC0gYm94Lm1pbi55KSAqIG1lc2guc2NhbGUueVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG1lc2hTY2FsZSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoID0gbWVzaFNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IG1lc2hTY2FsZS55XG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNoU2NhbGUueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc2hTY2FsZS55ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnogPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELm1hdHJpeE5lZWRzVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSB0aGUgcm9vdCBnbHRmIHNjYWxlLlxuICAgICAgICAgICAgICAgICAgICB2YXIgcGFyZW50MiA9IHRoaXMuZWwucGFyZW50RWwucGFyZW50RWwub2JqZWN0M0RcbiAgICAgICAgICAgICAgICAgICAgd2lkdGggKj0gcGFyZW50Mi5zY2FsZS54XG4gICAgICAgICAgICAgICAgICAgIGhlaWdodCAqPSBwYXJlbnQyLnNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5zY2FsZS54ID0gMVxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQyLnNjYWxlLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Mi5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5hY3R1YWxXaWR0aCA9IHdpZHRoXG4gICAgICAgICAgICAgICAgdGhpcy5hY3R1YWxIZWlnaHQgPSBoZWlnaHRcblxuICAgICAgICAgICAgICAgIGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB7d2lkdGg6IHdzaXplLCBoZWlnaHQ6IGhzaXplfSA9IHRoaXMuc2NyaXB0LmdldFNpemUoKVxuICAgICAgICAgICAgICAgICAgICBpZiAod3NpemUgPiAwICYmIGhzaXplID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHNjYWxlID0gTWF0aC5taW4od2lkdGggLyB3c2l6ZSwgaGVpZ2h0IC8gaHNpemUpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoXCJzY2FsZVwiLCB7IHg6IHNjYWxlLCB5OiBzY2FsZSwgejogc2NhbGV9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzcGlubmVyU2NhbGUgPSBNYXRoLm1pbih3aWR0aCxoZWlnaHQpICogMC4yNVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwaW5uZXJQbGFuZS5zY2FsZS5zZXQoc3Bpbm5lclNjYWxlLCBzcGlubmVyU2NhbGUsIDEpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gdGhlcmUgd2lsbCBiZSBvbmUgZWxlbWVudCBhbHJlYWR5LCB0aGUgY3ViZSB3ZSBjcmVhdGVkIGluIGJsZW5kZXJcbiAgICAgICAgICAgICAgICAvLyBhbmQgYXR0YWNoZWQgdGhpcyBjb21wb25lbnQgdG8sIHNvIHJlbW92ZSBpdCBpZiBpdCBpcyB0aGVyZS5cbiAgICAgICAgICAgICAgICAvLyB0aGlzLmVsLm9iamVjdDNELmNoaWxkcmVuLnBvcCgpXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuZWwub2JqZWN0M0QuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgYy52aXNpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gbWFrZSBzdXJlIFwiaXNTdGF0aWNcIiBpcyBjb3JyZWN0OyAgY2FuJ3QgYmUgc3RhdGljIGlmIGVpdGhlciBpbnRlcmFjdGl2ZSBvciBuZXR3b3JrZWRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNTdGF0aWMgJiYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUgfHwgdGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LmlzU3RhdGljID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIGFkZCBpbiBvdXIgY29udGFpbmVyXG4gICAgICAgICAgICAgICAgdGhpcy5lbC5hcHBlbmRDaGlsZCh0aGlzLnNpbXBsZUNvbnRhaW5lcilcblxuICAgICAgICAgICAgICAgIHRoaXMuZWwuc2V0T2JqZWN0M0QoXCJzcGlubmVyXCIsIHRoaXMuc3Bpbm5lclBsYW5lKVxuXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogIHdlIGFyZSBnb2luZyB0byBoYXZlIHRvIG1ha2Ugc3VyZSB0aGlzIHdvcmtzIGlmIFxuICAgICAgICAgICAgICAgIC8vIHRoZSBzY3JpcHQgaXMgT04gYW4gaW50ZXJhY3RhYmxlIChsaWtlIGFuIGltYWdlKVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmNsYXNzTGlzdC5jb250YWlucyhcImludGVyYWN0YWJsZVwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZShcImludGVyYWN0YWJsZVwiKVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gbWFrZSB0aGUgaHRtbCBvYmplY3QgY2xpY2thYmxlXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnaXMtcmVtb3RlLWhvdmVyLXRhcmdldCcsJycpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgndGFncycsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluc3BlY3RhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNTdGF0aWM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0b2dnbGVzSG92ZXJlZEFjdGlvblNldDogdHJ1ZVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgXCJpbnRlcmFjdGFibGVcIilcblxuICAgICAgICAgICAgICAgICAgICAvLyBmb3J3YXJkIHRoZSAnaW50ZXJhY3QnIGV2ZW50cyB0byBvdXIgb2JqZWN0IFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsaWNrZWQgPSB0aGlzLmNsaWNrZWQuYmluZCh0aGlzKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcblxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNEcmFnZ2FibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGFyZW4ndCBnb2luZyB0byByZWFsbHkgZGVhbCB3aXRoIHRoaXMgdGlsbCB3ZSBoYXZlIGEgdXNlIGNhc2UsIGJ1dFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2UgY2FuIHNldCBpdCB1cCBmb3Igbm93XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0hvbGRhYmxlOiB0cnVlLCAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaG9sZGFibGVCdXR0b246IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zcGVjdGFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTdGF0aWM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9nZ2xlc0hvdmVyZWRBY3Rpb25TZXQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaG9sZGFibGUtYnV0dG9uLWRvd24nLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuZHJhZ1N0YXJ0KGV2dClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdob2xkYWJsZS1idXR0b24tdXAnLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQuZHJhZ0VuZChldnQpXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy90aGlzLnJheWNhc3RlciA9IG5ldyBUSFJFRS5SYXljYXN0ZXIoKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5TCA9IG5ldyBUSFJFRS5SYXkoKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5UiA9IG5ldyBUSFJFRS5SYXkoKVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIG5vIGludGVyYWN0aXZpdHksIHBsZWFzZVxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jbGFzc0xpc3QuY29udGFpbnMoXCJpbnRlcmFjdGFibGVcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZShcImludGVyYWN0YWJsZVwiKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKFwiaXMtcmVtb3RlLWhvdmVyLXRhcmdldFwiKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFRPRE86IHRoaXMgU0hPVUxEIHdvcmsgYnV0IG1ha2Ugc3VyZSBpdCB3b3JrcyBpZiB0aGUgZWwgd2UgYXJlIG9uXG4gICAgICAgICAgICAgICAgLy8gaXMgbmV0d29ya2VkLCBzdWNoIGFzIHdoZW4gYXR0YWNoZWQgdG8gYW4gaW1hZ2VcblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmVsLmhhc0F0dHJpYnV0ZShcIm5ldHdvcmtlZFwiKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUF0dHJpYnV0ZShcIm5ldHdvcmtlZFwiKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIGZ1bmN0aW9uIGZpbmRzIGFuIGV4aXN0aW5nIGNvcHkgb2YgdGhlIE5ldHdvcmtlZCBFbnRpdHkgKGlmIHdlIGFyZSBub3QgdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGZpcnN0IGNsaWVudCBpbiB0aGUgcm9vbSBpdCB3aWxsIGV4aXN0IGluIG90aGVyIGNsaWVudHMgYW5kIGJlIGNyZWF0ZWQgYnkgTkFGKVxuICAgICAgICAgICAgICAgICAgICAvLyBvciBjcmVhdGUgYW4gZW50aXR5IGlmIHdlIGFyZSBmaXJzdC5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSA9IGZ1bmN0aW9uIChuZXR3b3JrZWRFbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBlcnNpc3RlbnQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG5ldElkO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5ldHdvcmtlZEVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2Ugd2lsbCBiZSBwYXJ0IG9mIGEgTmV0d29ya2VkIEdMVEYgaWYgdGhlIEdMVEYgd2FzIGRyb3BwZWQgb24gdGhlIHNjZW5lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3IgcGlubmVkIGFuZCBsb2FkZWQgd2hlbiB3ZSBlbnRlciB0aGUgcm9vbS4gIFVzZSB0aGUgbmV0d29ya2VkIHBhcmVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuZXR3b3JrSWQgcGx1cyBhIGRpc2FtYmlndWF0aW5nIGJpdCBvZiB0ZXh0IHRvIGNyZWF0ZSBhIHVuaXF1ZSBJZC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IE5BRi51dGlscy5nZXROZXR3b3JrSWQobmV0d29ya2VkRWwpICsgXCItaHRtbC1zY3JpcHRcIjtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHdlIG5lZWQgdG8gY3JlYXRlIGFuIGVudGl0eSwgdXNlIHRoZSBzYW1lIHBlcnNpc3RlbmNlIGFzIG91clxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmsgZW50aXR5ICh0cnVlIGlmIHBpbm5lZCwgZmFsc2UgaWYgbm90KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBlcnNpc3RlbnQgPSBlbnRpdHkuY29tcG9uZW50cy5uZXR3b3JrZWQuZGF0YS5wZXJzaXN0ZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzIG9ubHkgaGFwcGVucyBpZiB0aGlzIGNvbXBvbmVudCBpcyBvbiBhIHNjZW5lIGZpbGUsIHNpbmNlIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVsZW1lbnRzIG9uIHRoZSBzY2VuZSBhcmVuJ3QgbmV0d29ya2VkLiAgU28gbGV0J3MgYXNzdW1lIGVhY2ggZW50aXR5IGluIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNjZW5lIHdpbGwgaGF2ZSBhIHVuaXF1ZSBuYW1lLiAgQWRkaW5nIGEgYml0IG9mIHRleHQgc28gd2UgY2FuIGZpbmQgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpbiB0aGUgRE9NIHdoZW4gZGVidWdnaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldElkID0gdGhpcy5mdWxsTmFtZS5yZXBsYWNlQWxsKFwiX1wiLFwiLVwiKSArIFwiLWh0bWwtc2NyaXB0XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgaWYgdGhlIG5ldHdvcmtlZCBlbnRpdHkgd2UgY3JlYXRlIGZvciB0aGlzIGNvbXBvbmVudCBhbHJlYWR5IGV4aXN0cy4gXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UsIGNyZWF0ZSBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gLSBOT1RFOiBpdCBpcyBjcmVhdGVkIG9uIHRoZSBzY2VuZSwgbm90IGFzIGEgY2hpbGQgb2YgdGhpcyBlbnRpdHksIGJlY2F1c2VcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgTkFGIGNyZWF0ZXMgcmVtb3RlIGVudGl0aWVzIGluIHRoZSBzY2VuZS5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBlbnRpdHk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoTkFGLmVudGl0aWVzLmhhc0VudGl0eShuZXRJZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkgPSBOQUYuZW50aXRpZXMuZ2V0RW50aXR5KG5ldElkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYS1lbnRpdHknKVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3RvcmUgdGhlIG1ldGhvZCB0byByZXRyaWV2ZSB0aGUgc2NyaXB0IGRhdGEgb24gdGhpcyBlbnRpdHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkuZ2V0U2hhcmVkRGF0YSA9IHRoaXMuZ2V0U2hhcmVkRGF0YTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBcIm5ldHdvcmtlZFwiIGNvbXBvbmVudCBzaG91bGQgaGF2ZSBwZXJzaXN0ZW50PXRydWUsIHRoZSB0ZW1wbGF0ZSBhbmQgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHNldCwgb3duZXIgc2V0IHRvIFwic2NlbmVcIiAoc28gdGhhdCBpdCBkb2Vzbid0IHVwZGF0ZSB0aGUgcmVzdCBvZlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSB3b3JsZCB3aXRoIGl0J3MgaW5pdGlhbCBkYXRhLCBhbmQgc2hvdWxkIE5PVCBzZXQgY3JlYXRvciAodGhlIHN5c3RlbSB3aWxsIGRvIHRoYXQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LnNldEF0dHJpYnV0ZSgnbmV0d29ya2VkJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZTogXCIjc2NyaXB0LWRhdGEtbWVkaWFcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVyc2lzdGVudDogcGVyc2lzdGVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3duZXI6IFwic2NlbmVcIiwgIC8vIHNvIHRoYXQgb3VyIGluaXRpYWwgdmFsdWUgZG9lc24ndCBvdmVyd3JpdGUgb3RoZXJzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldHdvcmtJZDogbmV0SWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYXBwZW5kQ2hpbGQoZW50aXR5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2F2ZSBhIHBvaW50ZXIgdG8gdGhlIG5ldHdvcmtlZCBlbnRpdHkgYW5kIHRoZW4gd2FpdCBmb3IgaXQgdG8gYmUgZnVsbHlcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluaXRpYWxpemVkIGJlZm9yZSBnZXR0aW5nIGEgcG9pbnRlciB0byB0aGUgYWN0dWFsIG5ldHdvcmtlZCBjb21wb25lbnQgaW4gaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubmV0RW50aXR5ID0gZW50aXR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgTkFGLnV0aWxzLmdldE5ldHdvcmtlZEVudGl0eSh0aGlzLm5ldEVudGl0eSkudGhlbihuZXR3b3JrZWRFbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZVN5bmMgPSBuZXR3b3JrZWRFbC5jb21wb25lbnRzW1wic2NyaXB0LWRhdGFcIl1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoaXMgaXMgdGhlIGZpcnN0IG5ldHdvcmtlZCBlbnRpdHksIGl0J3Mgc2hhcmVkRGF0YSB3aWxsIGRlZmF1bHQgdG8gdGhlICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzdHJpbmcgXCJ7fVwiLCBhbmQgd2Ugc2hvdWxkIGluaXRpYWxpemUgaXQgd2l0aCB0aGUgaW5pdGlhbCBkYXRhIGZyb20gdGhlIHNjcmlwdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlU3luYy5zaGFyZWREYXRhLmxlbmd0aCA9PSAyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBuZXR3b3JrZWQgPSBuZXR3b3JrZWRFbC5jb21wb25lbnRzW1wibmV0d29ya2VkXCJdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIChuZXR3b3JrZWQuZGF0YS5jcmVhdG9yID09IE5BRi5jbGllbnRJZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgdGhpcy5zdGF0ZVN5bmMuaW5pdFNoYXJlZERhdGEodGhpcy5zY3JpcHQuZ2V0U2hhcmVkRGF0YSgpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5ID0gdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eS5iaW5kKHRoaXMpXG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIE5BRi51dGlscy5nZXROZXR3b3JrZWRFbnRpdHkodGhpcy5lbCkudGhlbihuZXR3b3JrZWRFbCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eShuZXR3b3JrZWRFbClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5KClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IHRoaXMuc2V0dXBOZXR3b3JrZWQuYmluZCh0aGlzKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgbWV0aG9kIGhhbmRsZXMgdGhlIGRpZmZlcmVudCBzdGFydHVwIGNhc2VzOlxuICAgICAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZSwgTkFGIHdpbGwgYmUgY29ubmVjdGVkIGFuZCB3ZSBjYW4gXG4gICAgICAgICAgICAgICAgICAgIC8vICAgaW1tZWRpYXRlbHkgaW5pdGlhbGl6ZVxuICAgICAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIGlzIGluIHRoZSByb29tIHNjZW5lIG9yIHBpbm5lZCwgaXQgd2lsbCBsaWtlbHkgYmUgY3JlYXRlZFxuICAgICAgICAgICAgICAgICAgICAvLyAgIGJlZm9yZSBOQUYgaXMgc3RhcnRlZCBhbmQgY29ubmVjdGVkLCBzbyB3ZSB3YWl0IGZvciBhbiBldmVudCB0aGF0IGlzXG4gICAgICAgICAgICAgICAgICAgIC8vICAgZmlyZWQgd2hlbiBIdWJzIGhhcyBzdGFydGVkIE5BRlxuICAgICAgICAgICAgICAgICAgICBpZiAoTkFGLmNvbm5lY3Rpb24gJiYgTkFGLmNvbm5lY3Rpb24uaXNDb25uZWN0ZWQoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCgpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ2RpZENvbm5lY3RUb05ldHdvcmtlZFNjZW5lJywgdGhpcy5zZXR1cE5ldHdvcmtlZClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLmNhdGNoKGUgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJsb2FkU2NyaXB0IGZhaWxlZCBmb3Igc2NyaXB0IFwiICsgdGhpcy5kYXRhLm5hbWUgKyBcIjogXCIgKyBlKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICAvLyBpZiBhdHRhY2hlZCB0byBhIG5vZGUgd2l0aCBhIG1lZGlhLWxvYWRlciBjb21wb25lbnQsIHRoaXMgbWVhbnMgd2UgYXR0YWNoZWQgdGhpcyBjb21wb25lbnRcbiAgICAgICAgLy8gdG8gYSBtZWRpYSBvYmplY3QgaW4gU3Bva2UuICBXZSBzaG91bGQgd2FpdCB0aWxsIHRoZSBvYmplY3QgaXMgZnVsbHkgbG9hZGVkLiAgXG4gICAgICAgIC8vIE90aGVyd2lzZSwgaXQgd2FzIGF0dGFjaGVkIHRvIHNvbWV0aGluZyBpbnNpZGUgYSBHTFRGIChwcm9iYWJseSBpbiBibGVuZGVyKVxuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdKSB7XG4gICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGxvYWRlcigpXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBvbmNlOiB0cnVlIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHBsYXk6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5wbGF5KClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBwYXVzZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5zY3JpcHQpIHtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LnBhdXNlKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBoYW5kbGUgXCJpbnRlcmFjdFwiIGV2ZW50cyBmb3IgY2xpY2thYmxlIGVudGl0aWVzXG4gICAgY2xpY2tlZDogZnVuY3Rpb24oZXZ0KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiY2xpY2tlZCBvbiBodG1sOiBcIiwgZXZ0KVxuICAgICAgICB0aGlzLnNjcmlwdC5jbGlja2VkKGV2dCkgXG4gICAgfSxcbiAgXG4gICAgLy8gbWV0aG9kcyB0aGF0IHdpbGwgYmUgcGFzc2VkIHRvIHRoZSBodG1sIG9iamVjdCBzbyB0aGV5IGNhbiB1cGRhdGUgbmV0d29ya2VkIGRhdGFcbiAgICB0YWtlT3duZXJzaGlwOiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZVN5bmMudGFrZU93bmVyc2hpcCgpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTsgIC8vIHN1cmUsIGdvIGFoZWFkIGFuZCBjaGFuZ2UgaXQgZm9yIG5vd1xuICAgICAgICB9XG4gICAgfSxcbiAgICBcbiAgICBzZXRTaGFyZWREYXRhOiBmdW5jdGlvbihkYXRhT2JqZWN0KSB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGVTeW5jLnNldFNoYXJlZERhdGEoZGF0YU9iamVjdClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH0sXG5cbiAgICAvLyB0aGlzIGlzIGNhbGxlZCBmcm9tIGJlbG93LCB0byBnZXQgdGhlIGluaXRpYWwgZGF0YSBmcm9tIHRoZSBzY3JpcHRcbiAgICBnZXRTaGFyZWREYXRhOiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuc2NyaXB0KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zY3JpcHQuZ2V0U2hhcmVkRGF0YSgpXG4gICAgICAgIH1cbiAgICAgICAgLy8gc2hvdWxkbid0IGhhcHBlblxuICAgICAgICBjb25zb2xlLndhcm4oXCJzY3JpcHQtZGF0YSBjb21wb25lbnQgY2FsbGVkIHBhcmVudCBlbGVtZW50IGJ1dCB0aGVyZSBpcyBubyBzY3JpcHQgeWV0P1wiKVxuICAgICAgICByZXR1cm4gXCJ7fVwiXG4gICAgfSxcblxuICAgIC8vIHBlciBmcmFtZSBzdHVmZlxuICAgIHRpY2s6IGZ1bmN0aW9uICh0aW1lKSB7XG4gICAgICAgIGlmICghdGhpcy5zY3JpcHQpIHJldHVyblxuXG4gICAgICAgIGlmICh0aGlzLmxvYWRpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuc3Bpbm5lclBsYW5lLnJvdGF0aW9uLnogKz0gMC4wM1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0LmlzSW50ZXJhY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAvLyBtb3JlIG9yIGxlc3MgY29waWVkIGZyb20gXCJob3ZlcmFibGUtdmlzdWFscy5qc1wiIGluIGh1YnNcbiAgICAgICAgICAgICAgICBjb25zdCB0b2dnbGluZyA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zW1wiaHVicy1zeXN0ZW1zXCJdLmN1cnNvclRvZ2dsaW5nU3lzdGVtO1xuICAgICAgICAgICAgICAgIHZhciBwYXNzdGhydUludGVyYWN0b3IgPSBbXVxuXG4gICAgICAgICAgICAgICAgbGV0IGludGVyYWN0b3JPbmUsIGludGVyYWN0b3JUd287XG4gICAgICAgICAgICAgICAgY29uc3QgaW50ZXJhY3Rpb24gPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5pbnRlcmFjdGlvbjtcbiAgICAgICAgICAgICAgICBpZiAoIWludGVyYWN0aW9uLnJlYWR5KSByZXR1cm47IC8vRE9NQ29udGVudFJlYWR5IHdvcmthcm91bmRcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBsZXQgaG92ZXJFbCA9IHRoaXMuc2ltcGxlQ29udGFpbmVyXG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhvdmVyZWQgPT09IGhvdmVyRWwgJiYgIWludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdG9yT25lID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0SGFuZC5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5zdGF0ZS5sZWZ0UmVtb3RlLmhvdmVyZWQgPT09IGhvdmVyRWwgJiZcbiAgICAgICAgICAgICAgICAhaW50ZXJhY3Rpb24uc3RhdGUubGVmdFJlbW90ZS5oZWxkICYmXG4gICAgICAgICAgICAgICAgIXRvZ2dsaW5nLmxlZnRUb2dnbGVkT2ZmXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3Rvck9uZSA9IGludGVyYWN0aW9uLm9wdGlvbnMubGVmdFJlbW90ZS5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdG9yT25lKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBwb3MgPSBpbnRlcmFjdG9yT25lLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgICAgIHBvcy5hZGRTY2FsZWRWZWN0b3IoZGlyLCAtMC4xKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5TC5zZXQocG9zLCBkaXIpXG5cbiAgICAgICAgICAgICAgICAgICAgcGFzc3RocnVJbnRlcmFjdG9yLnB1c2godGhpcy5ob3ZlclJheUwpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodFJlbW90ZS5ob3ZlcmVkID09PSBob3ZlckVsICYmXG4gICAgICAgICAgICAgICAgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhlbGQgJiZcbiAgICAgICAgICAgICAgICAhdG9nZ2xpbmcucmlnaHRUb2dnbGVkT2ZmXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3RvclR3byA9IGludGVyYWN0aW9uLm9wdGlvbnMucmlnaHRSZW1vdGUuZW50aXR5Lm9iamVjdDNEO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRIYW5kLmhvdmVyZWQgPT09IGhvdmVyRWwgJiYgIWludGVyYWN0aW9uLnN0YXRlLnJpZ2h0SGFuZC5oZWxkKSB7XG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0SGFuZC5lbnRpdHkub2JqZWN0M0Q7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdG9yVHdvKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBwb3MgPSBpbnRlcmFjdG9yVHdvLnBvc2l0aW9uXG4gICAgICAgICAgICAgICAgICAgIGxldCBkaXIgPSB0aGlzLnNjcmlwdC53ZWJMYXllcjNELmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpLm5lZ2F0ZSgpXG4gICAgICAgICAgICAgICAgICAgIHBvcy5hZGRTY2FsZWRWZWN0b3IoZGlyLCAtMC4xKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5Ui5zZXQocG9zLCBkaXIpXG4gICAgICAgICAgICAgICAgICAgIHBhc3N0aHJ1SW50ZXJhY3Rvci5wdXNoKHRoaXMuaG92ZXJSYXlSKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuc2NyaXB0LndlYkxheWVyM0QuaW50ZXJhY3Rpb25SYXlzID0gcGFzc3RocnVJbnRlcmFjdG9yXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHdlIGhhdmVuJ3QgZmluaXNoZWQgc2V0dGluZyB1cCB0aGUgbmV0d29ya2VkIGVudGl0eSBkb24ndCBkbyBhbnl0aGluZy5cbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMubmV0RW50aXR5IHx8ICF0aGlzLnN0YXRlU3luYykgeyByZXR1cm4gfVxuXG4gICAgICAgICAgICAgICAgLy8gaWYgdGhlIHN0YXRlIGhhcyBjaGFuZ2VkIGluIHRoZSBuZXR3b3JrZWQgZGF0YSwgdXBkYXRlIG91ciBodG1sIG9iamVjdFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlU3luYy5jaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jLmNoYW5nZWQgPSBmYWxzZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcmlwdC51cGRhdGVTaGFyZWREYXRhKHRoaXMuc3RhdGVTeW5jLmRhdGFPYmplY3QpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnNjcmlwdC50aWNrKHRpbWUpXG4gICAgICAgIH1cbiAgICB9LFxuICBcbiAgICAvLyBUT0RPOiAgc2hvdWxkIG9ubHkgYmUgY2FsbGVkIGlmIHRoZXJlIGlzIG5vIHBhcmFtZXRlciBzcGVjaWZ5aW5nIHRoZVxuICAgIC8vIGh0bWwgc2NyaXB0IG5hbWUuXG4gICAgcGFyc2VOb2RlTmFtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5mdWxsTmFtZSA9PT0gXCJcIikge1xuXG4gICAgICAgICAgICAvLyBUT0RPOiAgc3dpdGNoIHRoaXMgdG8gZmluZCBlbnZpcm9ubWVudC1yb290IGFuZCBnbyBkb3duIHRvIFxuICAgICAgICAgICAgLy8gdGhlIG5vZGUgYXQgdGhlIHJvb20gb2Ygc2NlbmUgKG9uZSBhYm92ZSB0aGUgdmFyaW91cyBub2RlcykuICBcbiAgICAgICAgICAgIC8vIHRoZW4gZ28gdXAgZnJvbSBoZXJlIHRpbGwgd2UgZ2V0IHRvIGEgbm9kZSB0aGF0IGhhcyB0aGF0IG5vZGVcbiAgICAgICAgICAgIC8vIGFzIGl0J3MgcGFyZW50XG4gICAgICAgICAgICB0aGlzLmZ1bGxOYW1lID0gdGhpcy5lbC5wYXJlbnRFbC5wYXJlbnRFbC5jbGFzc05hbWVcbiAgICAgICAgfSBcblxuICAgICAgICAvLyBub2RlcyBzaG91bGQgYmUgbmFtZWQgYW55dGhpbmcgYXQgdGhlIGJlZ2lubmluZyB3aXRoIFxuICAgICAgICAvLyAgXCJjb21wb25lbnROYW1lXCJcbiAgICAgICAgLy8gYXQgdGhlIHZlcnkgZW5kLiAgVGhpcyB3aWxsIGZldGNoIHRoZSBjb21wb25lbnQgZnJvbSB0aGUgcmVzb3VyY2VcbiAgICAgICAgLy8gY29tcG9uZW50TmFtZVxuICAgICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLmZ1bGxOYW1lLm1hdGNoKC9fKFtBLVphLXowLTldKikkLylcblxuICAgICAgICAvLyBpZiBwYXR0ZXJuIG1hdGNoZXMsIHdlIHdpbGwgaGF2ZSBsZW5ndGggb2YgMywgZmlyc3QgbWF0Y2ggaXMgdGhlIGRpcixcbiAgICAgICAgLy8gc2Vjb25kIGlzIHRoZSBjb21wb25lbnROYW1lIG5hbWUgb3IgbnVtYmVyXG4gICAgICAgIGlmICghcGFyYW1zIHx8IHBhcmFtcy5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJodG1sLXNjcmlwdCBjb21wb25lbnROYW1lIG5vdCBmb3JtYXR0ZWQgY29ycmVjdGx5OiBcIiwgdGhpcy5mdWxsTmFtZSlcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IG51bGxcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY29tcG9uZW50TmFtZSA9IHBhcmFtc1sxXVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIGxvYWRTY3JpcHQ6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gaWYgKHNjcmlwdFByb21pc2UpIHtcbiAgICAgICAgLy8gICAgIHRyeSB7XG4gICAgICAgIC8vICAgICAgICAgaHRtbENvbXBvbmVudHMgPSBhd2FpdCBzY3JpcHRQcm9taXNlO1xuICAgICAgICAvLyAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIC8vICAgICAgICAgY29uc29sZS5lcnJvcihlKTtcbiAgICAgICAgLy8gICAgICAgICByZXR1cm5cbiAgICAgICAgLy8gICAgIH1cbiAgICAgICAgLy8gICAgIHNjcmlwdFByb21pc2UgPSBudWxsXG4gICAgICAgIC8vIH1cbiAgICAgICAgdmFyIGluaXRTY3JpcHQgPSBodG1sQ29tcG9uZW50c1t0aGlzLmNvbXBvbmVudE5hbWVdXG4gICAgICAgIGlmICghaW5pdFNjcmlwdCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiJ2h0bWwtc2NyaXB0JyBjb21wb25lbnQgZG9lc24ndCBoYXZlIHNjcmlwdCBmb3IgXCIgKyB0aGlzLmNvbXBvbmVudE5hbWUpO1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5zY3JpcHQgPSBpbml0U2NyaXB0KHRoaXMuc2NyaXB0RGF0YSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJlcnJvciBjcmVhdGluZyBzY3JpcHQgZm9yIFwiICsgdGhpcy5jb21wb25lbnROYW1lLCBlKTtcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0ID0gbnVsbFxuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdCl7XG4gICAgICAgICAgICB0aGlzLnNjcmlwdC5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgICAgICAgIC8vIHRoaXMuc2NyaXB0LndlYkxheWVyM0QucmVmcmVzaCh0cnVlKVxuICAgICAgICAgICAgLy8gdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC51cGRhdGUodHJ1ZSlcbiAgICAgICAgICAgIHRoaXMuc2NyaXB0LndlYkxheWVyM0QudmlzaWJsZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLnNjcmlwdC53YWl0Rm9yUmVhZHkoKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7d2lkdGg6IHdzaXplLCBoZWlnaHQ6IGhzaXplfSA9IHRoaXMuc2NyaXB0LmdldFNpemUoKVxuICAgICAgICAgICAgICAgIGlmICh3c2l6ZSA+IDAgJiYgaHNpemUgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzY2FsZSA9IE1hdGgubWluKHRoaXMuYWN0dWFsV2lkdGggLyB3c2l6ZSwgdGhpcy5hY3R1YWxIZWlnaHQgLyBoc2l6ZSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKFwic2NhbGVcIiwgeyB4OiBzY2FsZSwgeTogc2NhbGUsIHo6IHNjYWxlfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gd2hlbiBhIHNjcmlwdCBmaW5pc2hlcyBnZXR0aW5nIHJlYWR5LCB0ZWxsIHRoZSBcbiAgICAgICAgICAgICAgICAvLyBwb3J0YWxzIHRvIHVwZGF0ZSB0aGVtc2VsdmVzXG4gICAgICAgICAgICAgICAgdGhpcy5zY3JpcHQud2ViTGF5ZXIzRC52aXNpYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0aGlzLmVsLnJlbW92ZU9iamVjdDNEKFwic3Bpbm5lclwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuZW1pdCgndXBkYXRlUG9ydGFscycpOyBcbiAgICAgICAgICAgIH0pXG5cdFx0fSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIidodG1sLXNjcmlwdCcgY29tcG9uZW50IGZhaWxlZCB0byBpbml0aWFsaXplIHNjcmlwdCBmb3IgXCIgKyB0aGlzLmNvbXBvbmVudE5hbWUpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmRlc3Ryb3lTY3JpcHQoKVxuICAgIH0sXG5cbiAgICBkZXN0cm95U2NyaXB0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcmlwdC5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5yZW1vdmVFdmVudExpc3RlbmVyKCdpbnRlcmFjdCcsIHRoaXMuY2xpY2tlZClcbiAgICAgICAgfVxuXG4gICAgICAgIHdpbmRvdy5BUFAuc2NlbmUucmVtb3ZlRXZlbnRMaXN0ZW5lcignZGlkQ29ubmVjdFRvTmV0d29ya2VkU2NlbmUnLCB0aGlzLnNldHVwTmV0d29ya2VkKVxuXG4gICAgICAgIHRoaXMuZWwucmVtb3ZlQ2hpbGQodGhpcy5zaW1wbGVDb250YWluZXIpXG4gICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnJlbW92ZU9iamVjdDNEKFwid2VibGF5ZXIzZFwiKVxuICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IG51bGxcblxuICAgICAgICBpZiAodGhpcy5zY3JpcHQuaXNOZXR3b3JrZWQgJiYgdGhpcy5uZXRFbnRpdHkucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLm5ldEVudGl0eSlcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcmlwdC5kZXN0cm95KClcbiAgICAgICAgdGhpcy5zY3JpcHQgPSBudWxsXG4gICAgfVxufSlcblxuLy9cbi8vIENvbXBvbmVudCBmb3Igb3VyIG5ldHdvcmtlZCBzdGF0ZS4gIFRoaXMgY29tcG9uZW50IGRvZXMgbm90aGluZyBleGNlcHQgYWxsIHVzIHRvIFxuLy8gY2hhbmdlIHRoZSBzdGF0ZSB3aGVuIGFwcHJvcHJpYXRlLiBXZSBjb3VsZCBzZXQgdGhpcyB1cCB0byBzaWduYWwgdGhlIGNvbXBvbmVudCBhYm92ZSB3aGVuXG4vLyBzb21ldGhpbmcgaGFzIGNoYW5nZWQsIGluc3RlYWQgb2YgaGF2aW5nIHRoZSBjb21wb25lbnQgYWJvdmUgcG9sbCBlYWNoIGZyYW1lLlxuLy9cblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdzY3JpcHQtZGF0YScsIHtcbiAgICBzY2hlbWE6IHtcbiAgICAgICAgc2NyaXB0ZGF0YToge3R5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwie31cIn0sXG4gICAgfSxcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMudGFrZU93bmVyc2hpcCA9IHRoaXMudGFrZU93bmVyc2hpcC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB0aGlzLmVsLmdldFNoYXJlZERhdGEoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzLmRhdGFPYmplY3QpKVxuICAgICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoXCJzY3JpcHQtZGF0YVwiLCBcInNjcmlwdGRhdGFcIiwgdGhpcy5zaGFyZWREYXRhKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ291bGRuJ3QgZW5jb2RlIGluaXRpYWwgc2NyaXB0IGRhdGEgb2JqZWN0OiBcIiwgZSwgdGhpcy5kYXRhT2JqZWN0KVxuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJ7fVwiXG4gICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9IGZhbHNlO1xuICAgIH0sXG5cbiAgICB1cGRhdGUoKSB7XG4gICAgICAgIHRoaXMuY2hhbmdlZCA9ICEodGhpcy5zaGFyZWREYXRhID09PSB0aGlzLmRhdGEuc2NyaXB0ZGF0YSk7XG4gICAgICAgIGlmICh0aGlzLmNoYW5nZWQpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQodGhpcy5kYXRhLnNjcmlwdGRhdGEpKVxuXG4gICAgICAgICAgICAgICAgLy8gZG8gdGhlc2UgYWZ0ZXIgdGhlIEpTT04gcGFyc2UgdG8gbWFrZSBzdXJlIGl0IGhhcyBzdWNjZWVkZWRcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSB0aGlzLmRhdGEuc2NyaXB0ZGF0YTtcbiAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZWQgPSB0cnVlXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiY291bGRuJ3QgcGFyc2UgSlNPTiByZWNlaXZlZCBpbiBzY3JpcHQtc3luYzogXCIsIGUpXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gXCJ7fVwiXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0ge31cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBpdCBpcyBsaWtlbHkgdGhhdCBhcHBseVBlcnNpc3RlbnRTeW5jIG9ubHkgbmVlZHMgdG8gYmUgY2FsbGVkIGZvciBwZXJzaXN0ZW50XG4gICAgLy8gbmV0d29ya2VkIGVudGl0aWVzLCBzbyB3ZSBfcHJvYmFibHlfIGRvbid0IG5lZWQgdG8gZG8gdGhpcy4gIEJ1dCBpZiB0aGVyZSBpcyBub1xuICAgIC8vIHBlcnNpc3RlbnQgZGF0YSBzYXZlZCBmcm9tIHRoZSBuZXR3b3JrIGZvciB0aGlzIGVudGl0eSwgdGhpcyBjb21tYW5kIGRvZXMgbm90aGluZy5cbiAgICBwbGF5KCkge1xuICAgICAgICBpZiAodGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZCkge1xuICAgICAgICAgICAgLy8gbm90IHN1cmUgaWYgdGhpcyBpcyByZWFsbHkgbmVlZGVkLCBidXQgY2FuJ3QgaHVydFxuICAgICAgICAgICAgaWYgKEFQUC51dGlscykgeyAvLyB0ZW1wb3JhcnkgdGlsbCB3ZSBzaGlwIG5ldyBjbGllbnRcbiAgICAgICAgICAgICAgICBBUFAudXRpbHMuYXBwbHlQZXJzaXN0ZW50U3luYyh0aGlzLmVsLmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEubmV0d29ya0lkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICB0YWtlT3duZXJzaGlwKCkge1xuICAgICAgICBpZiAoIU5BRi51dGlscy5pc01pbmUodGhpcy5lbCkgJiYgIU5BRi51dGlscy50YWtlT3duZXJzaGlwKHRoaXMuZWwpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSxcblxuICAgIC8vIGluaXRTaGFyZWREYXRhKGRhdGFPYmplY3QpIHtcbiAgICAvLyAgICAgdHJ5IHtcbiAgICAvLyAgICAgICAgIHZhciBodG1sU3RyaW5nID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KGRhdGFPYmplY3QpKVxuICAgIC8vICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gaHRtbFN0cmluZ1xuICAgIC8vICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gZGF0YU9iamVjdFxuICAgIC8vICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAvLyAgICAgfSBjYXRjaCAoZSkge1xuICAgIC8vICAgICAgICAgY29uc29sZS5lcnJvcihcImNhbid0IHN0cmluZ2lmeSB0aGUgb2JqZWN0IHBhc3NlZCB0byBzY3JpcHQtc3luY1wiKVxuICAgIC8vICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgLy8gICAgIH1cbiAgICAvLyB9LFxuXG4gICAgLy8gVGhlIGtleSBwYXJ0IGluIHRoZXNlIG1ldGhvZHMgKHdoaWNoIGFyZSBjYWxsZWQgZnJvbSB0aGUgY29tcG9uZW50IGFib3ZlKSBpcyB0b1xuICAgIC8vIGNoZWNrIGlmIHdlIGFyZSBhbGxvd2VkIHRvIGNoYW5nZSB0aGUgbmV0d29ya2VkIG9iamVjdC4gIElmIHdlIG93biBpdCAoaXNNaW5lKCkgaXMgdHJ1ZSlcbiAgICAvLyB3ZSBjYW4gY2hhbmdlIGl0LiAgSWYgd2UgZG9uJ3Qgb3duIGluLCB3ZSBjYW4gdHJ5IHRvIGJlY29tZSB0aGUgb3duZXIgd2l0aFxuICAgIC8vIHRha2VPd25lcnNoaXAoKS4gSWYgdGhpcyBzdWNjZWVkcywgd2UgY2FuIHNldCB0aGUgZGF0YS4gIFxuICAgIC8vXG4gICAgLy8gTk9URTogdGFrZU93bmVyc2hpcCBBVFRFTVBUUyB0byBiZWNvbWUgdGhlIG93bmVyLCBieSBhc3N1bWluZyBpdCBjYW4gYmVjb21lIHRoZVxuICAgIC8vIG93bmVyIGFuZCBub3RpZnlpbmcgdGhlIG5ldHdvcmtlZCBjb3BpZXMuICBJZiB0d28gb3IgbW9yZSBlbnRpdGllcyB0cnkgdG8gYmVjb21lXG4gICAgLy8gb3duZXIsICBvbmx5IG9uZSAodGhlIGxhc3Qgb25lIHRvIHRyeSkgYmVjb21lcyB0aGUgb3duZXIuICBBbnkgc3RhdGUgdXBkYXRlcyBkb25lXG4gICAgLy8gYnkgdGhlIFwiZmFpbGVkIGF0dGVtcHRlZCBvd25lcnNcIiB3aWxsIG5vdCBiZSBkaXN0cmlidXRlZCB0byB0aGUgb3RoZXIgY2xpZW50cyxcbiAgICAvLyBhbmQgd2lsbCBiZSBvdmVyd3JpdHRlbiAoZXZlbnR1YWxseSkgYnkgdXBkYXRlcyBmcm9tIHRoZSBvdGhlciBjbGllbnRzLiAgIEJ5IG5vdFxuICAgIC8vIGF0dGVtcHRpbmcgdG8gZ3VhcmFudGVlIG93bmVyc2hpcCwgdGhpcyBjYWxsIGlzIGZhc3QgYW5kIHN5bmNocm9ub3VzLiAgQW55IFxuICAgIC8vIG1ldGhvZHMgZm9yIGd1YXJhbnRlZWluZyBvd25lcnNoaXAgY2hhbmdlIHdvdWxkIHRha2UgYSBub24tdHJpdmlhbCBhbW91bnQgb2YgdGltZVxuICAgIC8vIGJlY2F1c2Ugb2YgbmV0d29yayBsYXRlbmNpZXMuXG5cbiAgICBzZXRTaGFyZWREYXRhKGRhdGFPYmplY3QpIHtcbiAgICAgICAgaWYgKCFOQUYudXRpbHMuaXNNaW5lKHRoaXMuZWwpICYmICFOQUYudXRpbHMudGFrZU93bmVyc2hpcCh0aGlzLmVsKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB2YXIgaHRtbFN0cmluZyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShkYXRhT2JqZWN0KSlcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGh0bWxTdHJpbmdcbiAgICAgICAgICAgIHRoaXMuZGF0YU9iamVjdCA9IGRhdGFPYmplY3RcbiAgICAgICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKFwic2NyaXB0LWRhdGFcIiwgXCJzY3JpcHRkYXRhXCIsIGh0bWxTdHJpbmcpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImNhbid0IHN0cmluZ2lmeSB0aGUgb2JqZWN0IHBhc3NlZCB0byBzY3JpcHQtc3luY1wiKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICB9XG59KTtcblxuLy8gQWRkIG91ciB0ZW1wbGF0ZSBmb3Igb3VyIG5ldHdvcmtlZCBvYmplY3QgdG8gdGhlIGEtZnJhbWUgYXNzZXRzIG9iamVjdCxcbi8vIGFuZCBhIHNjaGVtYSB0byB0aGUgTkFGLnNjaGVtYXMuICBCb3RoIG11c3QgYmUgdGhlcmUgdG8gaGF2ZSBjdXN0b20gY29tcG9uZW50cyB3b3JrXG5cbmNvbnN0IGFzc2V0cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJhLWFzc2V0c1wiKTtcblxuYXNzZXRzLmluc2VydEFkamFjZW50SFRNTChcbiAgICAnYmVmb3JlZW5kJyxcbiAgICBgXG4gICAgPHRlbXBsYXRlIGlkPVwic2NyaXB0LWRhdGEtbWVkaWFcIj5cbiAgICAgIDxhLWVudGl0eVxuICAgICAgICBzY3JpcHQtZGF0YVxuICAgICAgPjwvYS1lbnRpdHk+XG4gICAgPC90ZW1wbGF0ZT5cbiAgYFxuICApXG5cbmNvbnN0IHZlY3RvclJlcXVpcmVzVXBkYXRlID0gZXBzaWxvbiA9PiB7XG5cdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdGxldCBwcmV2ID0gbnVsbDtcblx0XHRcdHJldHVybiBjdXJyID0+IHtcblx0XHRcdFx0aWYgKHByZXYgPT09IG51bGwpIHtcblx0XHRcdFx0XHRwcmV2ID0gbmV3IFRIUkVFLlZlY3RvcjMoY3Vyci54LCBjdXJyLnksIGN1cnIueik7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIU5BRi51dGlscy5hbG1vc3RFcXVhbFZlYzMocHJldiwgY3VyciwgZXBzaWxvbikpIHtcblx0XHRcdFx0XHRwcmV2LmNvcHkoY3Vycik7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fTtcblx0XHR9O1xuXHR9O1xuXG5OQUYuc2NoZW1hcy5hZGQoe1xuICBcdHRlbXBsYXRlOiBcIiNzY3JpcHQtZGF0YS1tZWRpYVwiLFxuICAgIGNvbXBvbmVudHM6IFtcbiAgICAvLyB7XG4gICAgLy8gICAgIGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgIC8vICAgICBwcm9wZXJ0eTogXCJyb3RhdGlvblwiLFxuICAgIC8vICAgICByZXF1aXJlc05ldHdvcmtVcGRhdGU6IHZlY3RvclJlcXVpcmVzVXBkYXRlKDAuMDAxKVxuICAgIC8vIH0sXG4gICAgLy8ge1xuICAgIC8vICAgICBjb21wb25lbnQ6IFwic2NyaXB0LWRhdGFcIixcbiAgICAvLyAgICAgcHJvcGVydHk6IFwic2NhbGVcIixcbiAgICAvLyAgICAgcmVxdWlyZXNOZXR3b3JrVXBkYXRlOiB2ZWN0b3JSZXF1aXJlc1VwZGF0ZSgwLjAwMSlcbiAgICAvLyB9LFxuICAgIHtcbiAgICAgIFx0Y29tcG9uZW50OiBcInNjcmlwdC1kYXRhXCIsXG4gICAgICBcdHByb3BlcnR5OiBcInNjcmlwdGRhdGFcIlxuICAgIH1dLFxuICAgICAgbm9uQXV0aG9yaXplZENvbXBvbmVudHM6IFtcbiAgICAgIHtcbiAgICAgICAgICAgIGNvbXBvbmVudDogXCJzY3JpcHQtZGF0YVwiLFxuICAgICAgICAgICAgcHJvcGVydHk6IFwic2NyaXB0ZGF0YVwiXG4gICAgICB9XG4gICAgXSxcblxuICB9KTtcblxuIiwiLyoqXG4gKiBjb250cm9sIGEgdmlkZW8gZnJvbSBhIGNvbXBvbmVudCB5b3Ugc3RhbmQgb24uICBJbXBsZW1lbnRzIGEgcmFkaXVzIGZyb20gdGhlIGNlbnRlciBvZiBcbiAqIHRoZSBvYmplY3QgaXQncyBhdHRhY2hlZCB0bywgaW4gbWV0ZXJzXG4gKi9cblxuaW1wb3J0IHsgRW50aXR5LCBDb21wb25lbnQgfSBmcm9tICdhZnJhbWUnXG5pbXBvcnQgeyBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50IH0gZnJvbSAnLi4vdXRpbHMvc2NlbmUtZ3JhcGgnXG5pbXBvcnQgJy4vcHJveGltaXR5LWV2ZW50cy5qcydcblxuaW50ZXJmYWNlIEFPYmplY3QzRCBleHRlbmRzIFRIUkVFLk9iamVjdDNEIHtcbiAgICBlbDogRW50aXR5XG59XG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgndmlkZW8tY29udHJvbC1wYWQnLCB7XG4gICAgbWVkaWFWaWRlbzoge30gYXMgQ29tcG9uZW50LFxuICAgIFxuICAgIHNjaGVtYToge1xuICAgICAgICB0YXJnZXQ6IHsgdHlwZTogJ3N0cmluZycsIGRlZmF1bHQ6IFwiXCIgfSwgIC8vIGlmIG5vdGhpbmcgcGFzc2VkLCBqdXN0IGNyZWF0ZSBzb21lIG5vaXNlXG4gICAgICAgIHJhZGl1czogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMSB9XG4gICAgfSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuZGF0YS50YXJnZXQubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInZpZGVvLWNvbnRyb2wtcGFkIG11c3QgaGF2ZSAndGFyZ2V0JyBzZXRcIilcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gd2FpdCB1bnRpbCB0aGUgc2NlbmUgbG9hZHMgdG8gZmluaXNoLiAgV2Ugd2FudCB0byBtYWtlIHN1cmUgZXZlcnl0aGluZ1xuICAgICAgICAvLyBpcyBpbml0aWFsaXplZFxuICAgICAgICBsZXQgcm9vdCA9IGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnQodGhpcy5lbCwgXCJnbHRmLW1vZGVsLXBsdXNcIilcbiAgICAgICAgcm9vdCAmJiByb290LmFkZEV2ZW50TGlzdGVuZXIoXCJtb2RlbC1sb2FkZWRcIiwgKCkgPT4geyBcbiAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZSgpXG4gICAgICAgIH0pO1xuICAgIH0sXG4gICAgXG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgdiA9IHRoaXMuZWwuc2NlbmVFbD8ub2JqZWN0M0QuZ2V0T2JqZWN0QnlOYW1lKHRoaXMuZGF0YS50YXJnZXQpIGFzIEFPYmplY3QzRFxuICAgICAgICBpZiAodiA9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcInZpZGVvLWNvbnRyb2wtcGFkIHRhcmdldCAnXCIgKyB0aGlzLmRhdGEudGFyZ2V0ICsgXCInIGRvZXMgbm90IGV4aXN0XCIpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICggdi5lbC5jb21wb25lbnRzW1wibWVkaWEtbG9hZGVyXCJdIHx8IHYuZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdICkge1xuICAgICAgICAgICAgaWYgKHYuZWwuY29tcG9uZW50c1tcIm1lZGlhLWxvYWRlclwiXSkge1xuICAgICAgICAgICAgICAgIGxldCBmbiA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cFZpZGVvUGFkKHYpXG4gICAgICAgICAgICAgICAgICAgIHYuZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW9kZWwtbG9hZGVkJywgZm4pXG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2LmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgZm4pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBWaWRlb1BhZCh2KVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwidmlkZW8tY29udHJvbC1wYWQgdGFyZ2V0ICdcIiArIHRoaXMuZGF0YS50YXJnZXQgKyBcIicgaXMgbm90IGEgdmlkZW8gZWxlbWVudFwiKVxuICAgICAgICB9XG5cbiAgICB9LFxuXG4gICAgc2V0dXBWaWRlb1BhZDogZnVuY3Rpb24gKHZpZGVvOiBBT2JqZWN0M0QpIHtcbiAgICAgICAgdGhpcy5tZWRpYVZpZGVvID0gdmlkZW8uZWwuY29tcG9uZW50c1tcIm1lZGlhLXZpZGVvXCJdXG4gICAgICAgIGlmICh0aGlzLm1lZGlhVmlkZW8gPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJ2aWRlby1jb250cm9sLXBhZCB0YXJnZXQgJ1wiICsgdGhpcy5kYXRhLnRhcmdldCArIFwiJyBpcyBub3QgYSB2aWRlbyBlbGVtZW50XCIpXG4gICAgICAgIH1cblxuICAgICAgICAvLyAvL0B0cy1pZ25vcmVcbiAgICAgICAgLy8gaWYgKCF0aGlzLm1lZGlhVmlkZW8udmlkZW8ucGF1c2VkKSB7XG4gICAgICAgIC8vICAgICAvL0B0cy1pZ25vcmVcbiAgICAgICAgLy8gICAgIHRoaXMubWVkaWFWaWRlby50b2dnbGVQbGF5aW5nKClcbiAgICAgICAgLy8gfVxuXG4gICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdwcm94aW1pdHktZXZlbnRzJywgeyByYWRpdXM6IHRoaXMuZGF0YS5yYWRpdXMsIFlvZmZzZXQ6IDEuNiB9KVxuICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWVudGVyJywgKCkgPT4gdGhpcy5lbnRlclJlZ2lvbigpKVxuICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb3hpbWl0eWxlYXZlJywgKCkgPT4gdGhpcy5sZWF2ZVJlZ2lvbigpKVxuICAgIH0sXG5cbiAgICBlbnRlclJlZ2lvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5tZWRpYVZpZGVvLmRhdGEudmlkZW9QYXVzZWQpIHtcbiAgICAgICAgICAgIC8vQHRzLWlnbm9yZVxuICAgICAgICAgICAgdGhpcy5tZWRpYVZpZGVvLnRvZ2dsZVBsYXlpbmcoKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIGxlYXZlUmVnaW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghdGhpcy5tZWRpYVZpZGVvLmRhdGEudmlkZW9QYXVzZWQpIHtcbiAgICAgICAgICAgIC8vQHRzLWlnbm9yZVxuICAgICAgICAgICAgdGhpcy5tZWRpYVZpZGVvLnRvZ2dsZVBsYXlpbmcoKVxuICAgICAgICB9XG4gICAgfSxcbn0pXG4iLCJjb25zdCB0ZW1wVmVjdG9yMyA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5jb25zdCB0ZW1wUXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMYXN0V29ybGRQb3NpdGlvbihzcmMsIHRhcmdldCkge1xuICBzcmMudXBkYXRlTWF0cmljZXMoKTtcbiAgdGFyZ2V0LnNldEZyb21NYXRyaXhQb3NpdGlvbihzcmMubWF0cml4V29ybGQpO1xuICByZXR1cm4gdGFyZ2V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFzdFdvcmxkUXVhdGVybmlvbihzcmMsIHRhcmdldCkge1xuICBzcmMudXBkYXRlTWF0cmljZXMoKTtcbiAgc3JjLm1hdHJpeFdvcmxkLmRlY29tcG9zZSh0ZW1wVmVjdG9yMywgdGFyZ2V0LCB0ZW1wVmVjdG9yMyk7XG4gIHJldHVybiB0YXJnZXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMYXN0V29ybGRTY2FsZShzcmMsIHRhcmdldCkge1xuICBzcmMudXBkYXRlTWF0cmljZXMoKTtcbiAgc3JjLm1hdHJpeFdvcmxkLmRlY29tcG9zZSh0ZW1wVmVjdG9yMywgdGVtcFF1YXRlcm5pb24sIHRhcmdldCk7XG4gIHJldHVybiB0YXJnZXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkaXNwb3NlTWF0ZXJpYWwobXRybCkge1xuICBpZiAobXRybC5tYXApIG10cmwubWFwLmRpc3Bvc2UoKTtcbiAgaWYgKG10cmwubGlnaHRNYXApIG10cmwubGlnaHRNYXAuZGlzcG9zZSgpO1xuICBpZiAobXRybC5idW1wTWFwKSBtdHJsLmJ1bXBNYXAuZGlzcG9zZSgpO1xuICBpZiAobXRybC5ub3JtYWxNYXApIG10cmwubm9ybWFsTWFwLmRpc3Bvc2UoKTtcbiAgaWYgKG10cmwuc3BlY3VsYXJNYXApIG10cmwuc3BlY3VsYXJNYXAuZGlzcG9zZSgpO1xuICBpZiAobXRybC5lbnZNYXApIG10cmwuZW52TWFwLmRpc3Bvc2UoKTtcbiAgbXRybC5kaXNwb3NlKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkaXNwb3NlTm9kZShub2RlKSB7XG4gIGlmICghKG5vZGUgaW5zdGFuY2VvZiBUSFJFRS5NZXNoKSkgcmV0dXJuO1xuXG4gIGlmIChub2RlLmdlb21ldHJ5KSB7XG4gICAgbm9kZS5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gIH1cblxuICBpZiAobm9kZS5tYXRlcmlhbCkge1xuICAgIGxldCBtYXRlcmlhbEFycmF5O1xuICAgIGlmIChub2RlLm1hdGVyaWFsIGluc3RhbmNlb2YgVEhSRUUuTWVzaEZhY2VNYXRlcmlhbCB8fCBub2RlLm1hdGVyaWFsIGluc3RhbmNlb2YgVEhSRUUuTXVsdGlNYXRlcmlhbCkge1xuICAgICAgbWF0ZXJpYWxBcnJheSA9IG5vZGUubWF0ZXJpYWwubWF0ZXJpYWxzO1xuICAgIH0gZWxzZSBpZiAobm9kZS5tYXRlcmlhbCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBtYXRlcmlhbEFycmF5ID0gbm9kZS5tYXRlcmlhbDtcbiAgICB9XG4gICAgaWYgKG1hdGVyaWFsQXJyYXkpIHtcbiAgICAgIG1hdGVyaWFsQXJyYXkuZm9yRWFjaChkaXNwb3NlTWF0ZXJpYWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkaXNwb3NlTWF0ZXJpYWwobm9kZS5tYXRlcmlhbCk7XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IElERU5USVRZID0gbmV3IFRIUkVFLk1hdHJpeDQoKS5pZGVudGl0eSgpO1xuZXhwb3J0IGZ1bmN0aW9uIHNldE1hdHJpeFdvcmxkKG9iamVjdDNELCBtKSB7XG4gIGlmICghb2JqZWN0M0QubWF0cml4SXNNb2RpZmllZCkge1xuICAgIG9iamVjdDNELmFwcGx5TWF0cml4KElERU5USVRZKTsgLy8gaGFjayBhcm91bmQgb3VyIG1hdHJpeCBvcHRpbWl6YXRpb25zXG4gIH1cbiAgb2JqZWN0M0QubWF0cml4V29ybGQuY29weShtKTtcbiAgaWYgKG9iamVjdDNELnBhcmVudCkge1xuICAgIG9iamVjdDNELnBhcmVudC51cGRhdGVNYXRyaWNlcygpO1xuICAgIG9iamVjdDNELm1hdHJpeCA9IG9iamVjdDNELm1hdHJpeC5nZXRJbnZlcnNlKG9iamVjdDNELnBhcmVudC5tYXRyaXhXb3JsZCkubXVsdGlwbHkob2JqZWN0M0QubWF0cml4V29ybGQpO1xuICB9IGVsc2Uge1xuICAgIG9iamVjdDNELm1hdHJpeC5jb3B5KG9iamVjdDNELm1hdHJpeFdvcmxkKTtcbiAgfVxuICBvYmplY3QzRC5tYXRyaXguZGVjb21wb3NlKG9iamVjdDNELnBvc2l0aW9uLCBvYmplY3QzRC5xdWF0ZXJuaW9uLCBvYmplY3QzRC5zY2FsZSk7XG4gIG9iamVjdDNELmNoaWxkcmVuTmVlZE1hdHJpeFdvcmxkVXBkYXRlID0gdHJ1ZTtcbn1cblxuLy8gTW9kaWZpZWQgdmVyc2lvbiBvZiBEb24gTWNDdXJkeSdzIEFuaW1hdGlvblV0aWxzLmNsb25lXG4vLyBodHRwczovL2dpdGh1Yi5jb20vbXJkb29iL3RocmVlLmpzL3B1bGwvMTQ0OTRcblxuZnVuY3Rpb24gcGFyYWxsZWxUcmF2ZXJzZShhLCBiLCBjYWxsYmFjaykge1xuICBjYWxsYmFjayhhLCBiKTtcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IGEuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICBwYXJhbGxlbFRyYXZlcnNlKGEuY2hpbGRyZW5baV0sIGIuY2hpbGRyZW5baV0sIGNhbGxiYWNrKTtcbiAgfVxufVxuXG4vLyBTdXBwb3J0cyB0aGUgZm9sbG93aW5nIFByb3BlcnR5QmluZGluZyBwYXRoIGZvcm1hdHM6XG4vLyB1dWlkLnByb3BlcnR5TmFtZVxuLy8gdXVpZC5wcm9wZXJ0eU5hbWVbcHJvcGVydHlJbmRleF1cbi8vIHV1aWQub2JqZWN0TmFtZVtvYmplY3RJbmRleF0ucHJvcGVydHlOYW1lW3Byb3BlcnR5SW5kZXhdXG4vLyBEb2VzIG5vdCBzdXBwb3J0IHByb3BlcnR5IGJpbmRpbmdzIHRoYXQgdXNlIG9iamVjdDNEIG5hbWVzIG9yIHBhcmVudCBub2Rlc1xuZnVuY3Rpb24gY2xvbmVLZXlmcmFtZVRyYWNrKHNvdXJjZUtleWZyYW1lVHJhY2ssIGNsb25lVVVJRExvb2t1cCkge1xuICBjb25zdCB7IG5vZGVOYW1lOiB1dWlkLCBvYmplY3ROYW1lLCBvYmplY3RJbmRleCwgcHJvcGVydHlOYW1lLCBwcm9wZXJ0eUluZGV4IH0gPSBUSFJFRS5Qcm9wZXJ0eUJpbmRpbmcucGFyc2VUcmFja05hbWUoXG4gICAgc291cmNlS2V5ZnJhbWVUcmFjay5uYW1lXG4gICk7XG5cbiAgbGV0IHBhdGggPSBcIlwiO1xuXG4gIGlmICh1dWlkICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBjbG9uZWRVVUlEID0gY2xvbmVVVUlETG9va3VwLmdldCh1dWlkKTtcblxuICAgIGlmIChjbG9uZWRVVUlEID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnNvbGUud2FybihgQ291bGQgbm90IGZpbmQgS2V5ZnJhbWVUcmFjayB0YXJnZXQgd2l0aCB1dWlkOiBcIiR7dXVpZH1cImApO1xuICAgIH1cblxuICAgIHBhdGggKz0gY2xvbmVkVVVJRDtcbiAgfVxuXG4gIGlmIChvYmplY3ROYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICBwYXRoICs9IFwiLlwiICsgb2JqZWN0TmFtZTtcbiAgfVxuXG4gIGlmIChvYmplY3RJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcGF0aCArPSBcIltcIiArIG9iamVjdEluZGV4ICsgXCJdXCI7XG4gIH1cblxuICBpZiAocHJvcGVydHlOYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICBwYXRoICs9IFwiLlwiICsgcHJvcGVydHlOYW1lO1xuICB9XG5cbiAgaWYgKHByb3BlcnR5SW5kZXggIT09IHVuZGVmaW5lZCkge1xuICAgIHBhdGggKz0gXCJbXCIgKyBwcm9wZXJ0eUluZGV4ICsgXCJdXCI7XG4gIH1cblxuICBjb25zdCBjbG9uZWRLZXlmcmFtZVRyYWNrID0gc291cmNlS2V5ZnJhbWVUcmFjay5jbG9uZSgpO1xuICBjbG9uZWRLZXlmcmFtZVRyYWNrLm5hbWUgPSBwYXRoO1xuXG4gIHJldHVybiBjbG9uZWRLZXlmcmFtZVRyYWNrO1xufVxuXG5mdW5jdGlvbiBjbG9uZUFuaW1hdGlvbkNsaXAoc291cmNlQW5pbWF0aW9uQ2xpcCwgY2xvbmVVVUlETG9va3VwKSB7XG4gIGNvbnN0IGNsb25lZFRyYWNrcyA9IHNvdXJjZUFuaW1hdGlvbkNsaXAudHJhY2tzLm1hcChrZXlmcmFtZVRyYWNrID0+XG4gICAgY2xvbmVLZXlmcmFtZVRyYWNrKGtleWZyYW1lVHJhY2ssIGNsb25lVVVJRExvb2t1cClcbiAgKTtcbiAgcmV0dXJuIG5ldyBUSFJFRS5BbmltYXRpb25DbGlwKHNvdXJjZUFuaW1hdGlvbkNsaXAubmFtZSwgc291cmNlQW5pbWF0aW9uQ2xpcC5kdXJhdGlvbiwgY2xvbmVkVHJhY2tzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lT2JqZWN0M0Qoc291cmNlLCBwcmVzZXJ2ZVVVSURzKSB7XG4gIGNvbnN0IGNsb25lTG9va3VwID0gbmV3IE1hcCgpO1xuICBjb25zdCBjbG9uZVVVSURMb29rdXAgPSBuZXcgTWFwKCk7XG5cbiAgY29uc3QgY2xvbmUgPSBzb3VyY2UuY2xvbmUoKTtcblxuICBwYXJhbGxlbFRyYXZlcnNlKHNvdXJjZSwgY2xvbmUsIChzb3VyY2VOb2RlLCBjbG9uZWROb2RlKSA9PiB7XG4gICAgY2xvbmVMb29rdXAuc2V0KHNvdXJjZU5vZGUsIGNsb25lZE5vZGUpO1xuICB9KTtcblxuICBzb3VyY2UudHJhdmVyc2Uoc291cmNlTm9kZSA9PiB7XG4gICAgY29uc3QgY2xvbmVkTm9kZSA9IGNsb25lTG9va3VwLmdldChzb3VyY2VOb2RlKTtcblxuICAgIGlmIChwcmVzZXJ2ZVVVSURzKSB7XG4gICAgICBjbG9uZWROb2RlLnV1aWQgPSBzb3VyY2VOb2RlLnV1aWQ7XG4gICAgfVxuXG4gICAgY2xvbmVVVUlETG9va3VwLnNldChzb3VyY2VOb2RlLnV1aWQsIGNsb25lZE5vZGUudXVpZCk7XG4gIH0pO1xuXG4gIHNvdXJjZS50cmF2ZXJzZShzb3VyY2VOb2RlID0+IHtcbiAgICBjb25zdCBjbG9uZWROb2RlID0gY2xvbmVMb29rdXAuZ2V0KHNvdXJjZU5vZGUpO1xuXG4gICAgaWYgKCFjbG9uZWROb2RlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHNvdXJjZU5vZGUuYW5pbWF0aW9ucykge1xuICAgICAgY2xvbmVkTm9kZS5hbmltYXRpb25zID0gc291cmNlTm9kZS5hbmltYXRpb25zLm1hcChhbmltYXRpb25DbGlwID0+XG4gICAgICAgIGNsb25lQW5pbWF0aW9uQ2xpcChhbmltYXRpb25DbGlwLCBjbG9uZVVVSURMb29rdXApXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmIChzb3VyY2VOb2RlLmlzTWVzaCAmJiBzb3VyY2VOb2RlLmdlb21ldHJ5LmJvdW5kc1RyZWUpIHtcbiAgICAgIGNsb25lZE5vZGUuZ2VvbWV0cnkuYm91bmRzVHJlZSA9IHNvdXJjZU5vZGUuZ2VvbWV0cnkuYm91bmRzVHJlZTtcbiAgICB9XG5cbiAgICBpZiAoKGNsb25lZE5vZGUuaXNEaXJlY3Rpb25hbExpZ2h0IHx8IGNsb25lZE5vZGUuaXNTcG90TGlnaHQpICYmIHNvdXJjZU5vZGUudGFyZ2V0KSB7XG4gICAgICBjbG9uZWROb2RlLnRhcmdldCA9IGNsb25lTG9va3VwLmdldChzb3VyY2VOb2RlLnRhcmdldCk7XG4gICAgfVxuXG4gICAgaWYgKCFzb3VyY2VOb2RlLmlzU2tpbm5lZE1lc2gpIHJldHVybjtcblxuICAgIGNvbnN0IHNvdXJjZUJvbmVzID0gc291cmNlTm9kZS5za2VsZXRvbi5ib25lcztcblxuICAgIGNsb25lZE5vZGUuc2tlbGV0b24gPSBzb3VyY2VOb2RlLnNrZWxldG9uLmNsb25lKCk7XG5cbiAgICBjbG9uZWROb2RlLnNrZWxldG9uLmJvbmVzID0gc291cmNlQm9uZXMubWFwKHNvdXJjZUJvbmUgPT4ge1xuICAgICAgaWYgKCFjbG9uZUxvb2t1cC5oYXMoc291cmNlQm9uZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUmVxdWlyZWQgYm9uZXMgYXJlIG5vdCBkZXNjZW5kYW50cyBvZiB0aGUgZ2l2ZW4gb2JqZWN0LlwiKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGNsb25lTG9va3VwLmdldChzb3VyY2VCb25lKTtcbiAgICB9KTtcblxuICAgIGNsb25lZE5vZGUuYmluZChjbG9uZWROb2RlLnNrZWxldG9uLCBzb3VyY2VOb2RlLmJpbmRNYXRyaXgpO1xuICB9KTtcblxuICByZXR1cm4gY2xvbmU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTm9kZShyb290LCBwcmVkKSB7XG4gIGxldCBub2RlcyA9IFtyb290XTtcbiAgd2hpbGUgKG5vZGVzLmxlbmd0aCkge1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlcy5zaGlmdCgpO1xuICAgIGlmIChwcmVkKG5vZGUpKSByZXR1cm4gbm9kZTtcbiAgICBpZiAobm9kZS5jaGlsZHJlbikgbm9kZXMgPSBub2Rlcy5jb25jYXQobm9kZS5jaGlsZHJlbik7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBjb25zdCBpbnRlcnBvbGF0ZUFmZmluZSA9IChmdW5jdGlvbigpIHtcbiAgY29uc3QgbWF0NCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IGVuZCA9IHtcbiAgICBwb3NpdGlvbjogbmV3IFRIUkVFLlZlY3RvcjMoKSxcbiAgICBxdWF0ZXJuaW9uOiBuZXcgVEhSRUUuUXVhdGVybmlvbigpLFxuICAgIHNjYWxlOiBuZXcgVEhSRUUuVmVjdG9yMygpXG4gIH07XG4gIGNvbnN0IHN0YXJ0ID0ge1xuICAgIHBvc2l0aW9uOiBuZXcgVEhSRUUuVmVjdG9yMygpLFxuICAgIHF1YXRlcm5pb246IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCksXG4gICAgc2NhbGU6IG5ldyBUSFJFRS5WZWN0b3IzKClcbiAgfTtcbiAgY29uc3QgaW50ZXJwb2xhdGVkID0ge1xuICAgIHBvc2l0aW9uOiBuZXcgVEhSRUUuVmVjdG9yMygpLFxuICAgIHF1YXRlcm5pb246IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCksXG4gICAgc2NhbGU6IG5ldyBUSFJFRS5WZWN0b3IzKClcbiAgfTtcbiAgcmV0dXJuIGZ1bmN0aW9uKHN0YXJ0TWF0NCwgZW5kTWF0NCwgcHJvZ3Jlc3MsIG91dE1hdDQpIHtcbiAgICBzdGFydC5xdWF0ZXJuaW9uLnNldEZyb21Sb3RhdGlvbk1hdHJpeChtYXQ0LmV4dHJhY3RSb3RhdGlvbihzdGFydE1hdDQpKTtcbiAgICBlbmQucXVhdGVybmlvbi5zZXRGcm9tUm90YXRpb25NYXRyaXgobWF0NC5leHRyYWN0Um90YXRpb24oZW5kTWF0NCkpO1xuICAgIFRIUkVFLlF1YXRlcm5pb24uc2xlcnAoc3RhcnQucXVhdGVybmlvbiwgZW5kLnF1YXRlcm5pb24sIGludGVycG9sYXRlZC5xdWF0ZXJuaW9uLCBwcm9ncmVzcyk7XG4gICAgaW50ZXJwb2xhdGVkLnBvc2l0aW9uLmxlcnBWZWN0b3JzKFxuICAgICAgc3RhcnQucG9zaXRpb24uc2V0RnJvbU1hdHJpeENvbHVtbihzdGFydE1hdDQsIDMpLFxuICAgICAgZW5kLnBvc2l0aW9uLnNldEZyb21NYXRyaXhDb2x1bW4oZW5kTWF0NCwgMyksXG4gICAgICBwcm9ncmVzc1xuICAgICk7XG4gICAgaW50ZXJwb2xhdGVkLnNjYWxlLmxlcnBWZWN0b3JzKFxuICAgICAgc3RhcnQuc2NhbGUuc2V0RnJvbU1hdHJpeFNjYWxlKHN0YXJ0TWF0NCksXG4gICAgICBlbmQuc2NhbGUuc2V0RnJvbU1hdHJpeFNjYWxlKGVuZE1hdDQpLFxuICAgICAgcHJvZ3Jlc3NcbiAgICApO1xuICAgIHJldHVybiBvdXRNYXQ0LmNvbXBvc2UoXG4gICAgICBpbnRlcnBvbGF0ZWQucG9zaXRpb24sXG4gICAgICBpbnRlcnBvbGF0ZWQucXVhdGVybmlvbixcbiAgICAgIGludGVycG9sYXRlZC5zY2FsZVxuICAgICk7XG4gIH07XG59KSgpO1xuXG5leHBvcnQgY29uc3Qgc3F1YXJlRGlzdGFuY2VCZXR3ZWVuID0gKGZ1bmN0aW9uKCkge1xuICBjb25zdCBwb3NBID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgY29uc3QgcG9zQiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIHJldHVybiBmdW5jdGlvbihvYmpBLCBvYmpCKSB7XG4gICAgb2JqQS51cGRhdGVNYXRyaWNlcygpO1xuICAgIG9iakIudXBkYXRlTWF0cmljZXMoKTtcbiAgICBwb3NBLnNldEZyb21NYXRyaXhDb2x1bW4ob2JqQS5tYXRyaXhXb3JsZCwgMyk7XG4gICAgcG9zQi5zZXRGcm9tTWF0cml4Q29sdW1uKG9iakIubWF0cml4V29ybGQsIDMpO1xuICAgIHJldHVybiBwb3NBLmRpc3RhbmNlVG9TcXVhcmVkKHBvc0IpO1xuICB9O1xufSkoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzQWxtb3N0VW5pZm9ybVZlY3RvcjModiwgZXBzaWxvbkhhbGYgPSAwLjAwNSkge1xuICByZXR1cm4gTWF0aC5hYnModi54IC0gdi55KSA8IGVwc2lsb25IYWxmICYmIE1hdGguYWJzKHYueCAtIHYueikgPCBlcHNpbG9uSGFsZjtcbn1cbmV4cG9ydCBmdW5jdGlvbiBhbG1vc3RFcXVhbChhLCBiLCBlcHNpbG9uID0gMC4wMSkge1xuICByZXR1cm4gTWF0aC5hYnMoYSAtIGIpIDwgZXBzaWxvbjtcbn1cblxuZXhwb3J0IGNvbnN0IGFmZml4VG9Xb3JsZFVwID0gKGZ1bmN0aW9uKCkge1xuICBjb25zdCBpblJvdGF0aW9uTWF0NCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IGluRm9yd2FyZCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIGNvbnN0IG91dEZvcndhcmQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICBjb25zdCBvdXRTaWRlID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgY29uc3Qgd29ybGRVcCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7IC8vIENvdWxkIGJlIGNhbGxlZCBcIm91dFVwXCJcbiAgY29uc3QgdiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIGNvbnN0IGluTWF0NENvcHkgPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICByZXR1cm4gZnVuY3Rpb24gYWZmaXhUb1dvcmxkVXAoaW5NYXQ0LCBvdXRNYXQ0KSB7XG4gICAgaW5Sb3RhdGlvbk1hdDQuaWRlbnRpdHkoKS5leHRyYWN0Um90YXRpb24oaW5NYXQ0Q29weS5jb3B5KGluTWF0NCkpO1xuICAgIGluRm9yd2FyZC5zZXRGcm9tTWF0cml4Q29sdW1uKGluUm90YXRpb25NYXQ0LCAyKS5tdWx0aXBseVNjYWxhcigtMSk7XG4gICAgb3V0Rm9yd2FyZFxuICAgICAgLmNvcHkoaW5Gb3J3YXJkKVxuICAgICAgLnN1Yih2LmNvcHkoaW5Gb3J3YXJkKS5wcm9qZWN0T25WZWN0b3Iod29ybGRVcC5zZXQoMCwgMSwgMCkpKVxuICAgICAgLm5vcm1hbGl6ZSgpO1xuICAgIG91dFNpZGUuY3Jvc3NWZWN0b3JzKG91dEZvcndhcmQsIHdvcmxkVXApO1xuICAgIG91dE1hdDQubWFrZUJhc2lzKG91dFNpZGUsIHdvcmxkVXAsIG91dEZvcndhcmQubXVsdGlwbHlTY2FsYXIoLTEpKTtcbiAgICBvdXRNYXQ0LnNjYWxlKHYuc2V0RnJvbU1hdHJpeFNjYWxlKGluTWF0NENvcHkpKTtcbiAgICBvdXRNYXQ0LnNldFBvc2l0aW9uKHYuc2V0RnJvbU1hdHJpeENvbHVtbihpbk1hdDRDb3B5LCAzKSk7XG4gICAgcmV0dXJuIG91dE1hdDQ7XG4gIH07XG59KSgpO1xuXG5leHBvcnQgY29uc3QgY2FsY3VsYXRlQ2FtZXJhVHJhbnNmb3JtRm9yV2F5cG9pbnQgPSAoZnVuY3Rpb24oKSB7XG4gIGNvbnN0IHVwQWZmaXhlZENhbWVyYVRyYW5zZm9ybSA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IHVwQWZmaXhlZFdheXBvaW50VHJhbnNmb3JtID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgZGV0YWNoRnJvbVdvcmxkVXAgPSBuZXcgVEhSRUUuTWF0cml4NCgpO1xuICByZXR1cm4gZnVuY3Rpb24gY2FsY3VsYXRlQ2FtZXJhVHJhbnNmb3JtRm9yV2F5cG9pbnQoY2FtZXJhVHJhbnNmb3JtLCB3YXlwb2ludFRyYW5zZm9ybSwgb3V0TWF0NCkge1xuICAgIGFmZml4VG9Xb3JsZFVwKGNhbWVyYVRyYW5zZm9ybSwgdXBBZmZpeGVkQ2FtZXJhVHJhbnNmb3JtKTtcbiAgICBkZXRhY2hGcm9tV29ybGRVcC5nZXRJbnZlcnNlKHVwQWZmaXhlZENhbWVyYVRyYW5zZm9ybSkubXVsdGlwbHkoY2FtZXJhVHJhbnNmb3JtKTtcbiAgICBhZmZpeFRvV29ybGRVcCh3YXlwb2ludFRyYW5zZm9ybSwgdXBBZmZpeGVkV2F5cG9pbnRUcmFuc2Zvcm0pO1xuICAgIG91dE1hdDQuY29weSh1cEFmZml4ZWRXYXlwb2ludFRyYW5zZm9ybSkubXVsdGlwbHkoZGV0YWNoRnJvbVdvcmxkVXApO1xuICB9O1xufSkoKTtcblxuZXhwb3J0IGNvbnN0IGNhbGN1bGF0ZVZpZXdpbmdEaXN0YW5jZSA9IChmdW5jdGlvbigpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIGNhbGN1bGF0ZVZpZXdpbmdEaXN0YW5jZShmb3YsIGFzcGVjdCwgYm94LCBjZW50ZXIsIHZyTW9kZSkge1xuICAgIGNvbnN0IGhhbGZZRXh0ZW50cyA9IE1hdGgubWF4KE1hdGguYWJzKGJveC5tYXgueSAtIGNlbnRlci55KSwgTWF0aC5hYnMoY2VudGVyLnkgLSBib3gubWluLnkpKTtcbiAgICBjb25zdCBoYWxmWEV4dGVudHMgPSBNYXRoLm1heChNYXRoLmFicyhib3gubWF4LnggLSBjZW50ZXIueCksIE1hdGguYWJzKGNlbnRlci54IC0gYm94Lm1pbi54KSk7XG4gICAgY29uc3QgaGFsZlZlcnRGT1YgPSBUSFJFRS5NYXRoLmRlZ1RvUmFkKGZvdiAvIDIpO1xuICAgIGNvbnN0IGhhbGZIb3JGT1YgPSBNYXRoLmF0YW4oTWF0aC50YW4oaGFsZlZlcnRGT1YpICogYXNwZWN0KSAqICh2ck1vZGUgPyAwLjUgOiAxKTtcbiAgICBjb25zdCBtYXJnaW4gPSAxLjA1O1xuICAgIGNvbnN0IGxlbmd0aDEgPSBNYXRoLmFicygoaGFsZllFeHRlbnRzICogbWFyZ2luKSAvIE1hdGgudGFuKGhhbGZWZXJ0Rk9WKSk7XG4gICAgY29uc3QgbGVuZ3RoMiA9IE1hdGguYWJzKChoYWxmWEV4dGVudHMgKiBtYXJnaW4pIC8gTWF0aC50YW4oaGFsZkhvckZPVikpO1xuICAgIGNvbnN0IGxlbmd0aDMgPSBNYXRoLmFicyhib3gubWF4LnogLSBjZW50ZXIueikgKyBNYXRoLm1heChsZW5ndGgxLCBsZW5ndGgyKTtcbiAgICBjb25zdCBsZW5ndGggPSB2ck1vZGUgPyBNYXRoLm1heCgwLjI1LCBsZW5ndGgzKSA6IGxlbmd0aDM7XG4gICAgcmV0dXJuIGxlbmd0aCB8fCAxLjI1O1xuICB9O1xufSkoKTtcblxuZXhwb3J0IGNvbnN0IHJvdGF0ZUluUGxhY2VBcm91bmRXb3JsZFVwID0gKGZ1bmN0aW9uKCkge1xuICBjb25zdCBpbk1hdDRDb3B5ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3Qgc3RhcnRSb3RhdGlvbiA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gIGNvbnN0IGVuZFJvdGF0aW9uID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgdiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gIHJldHVybiBmdW5jdGlvbiByb3RhdGVJblBsYWNlQXJvdW5kV29ybGRVcChpbk1hdDQsIHRoZXRhLCBvdXRNYXQ0KSB7XG4gICAgaW5NYXQ0Q29weS5jb3B5KGluTWF0NCk7XG4gICAgcmV0dXJuIG91dE1hdDRcbiAgICAgIC5jb3B5KGVuZFJvdGF0aW9uLm1ha2VSb3RhdGlvblkodGhldGEpLm11bHRpcGx5KHN0YXJ0Um90YXRpb24uZXh0cmFjdFJvdGF0aW9uKGluTWF0NENvcHkpKSlcbiAgICAgIC5zY2FsZSh2LnNldEZyb21NYXRyaXhTY2FsZShpbk1hdDRDb3B5KSlcbiAgICAgIC5zZXRQb3NpdGlvbih2LnNldEZyb21NYXRyaXhQb3NpdGlvbihpbk1hdDRDb3B5KSk7XG4gIH07XG59KSgpO1xuXG5leHBvcnQgY29uc3QgY2hpbGRNYXRjaCA9IChmdW5jdGlvbigpIHtcbiAgY29uc3QgaW52ZXJzZVBhcmVudFdvcmxkID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgY2hpbGRSZWxhdGl2ZVRvUGFyZW50ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgY2hpbGRJbnZlcnNlID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgY29uc3QgbmV3UGFyZW50TWF0cml4ID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgLy8gdHJhbnNmb3JtIHRoZSBwYXJlbnQgc3VjaCB0aGF0IGl0cyBjaGlsZCBtYXRjaGVzIHRoZSB0YXJnZXRcbiAgcmV0dXJuIGZ1bmN0aW9uIGNoaWxkTWF0Y2gocGFyZW50LCBjaGlsZCwgdGFyZ2V0KSB7XG4gICAgcGFyZW50LnVwZGF0ZU1hdHJpY2VzKCk7XG4gICAgaW52ZXJzZVBhcmVudFdvcmxkLmdldEludmVyc2UocGFyZW50Lm1hdHJpeFdvcmxkKTtcbiAgICBjaGlsZC51cGRhdGVNYXRyaWNlcygpO1xuICAgIGNoaWxkUmVsYXRpdmVUb1BhcmVudC5tdWx0aXBseU1hdHJpY2VzKGludmVyc2VQYXJlbnRXb3JsZCwgY2hpbGQubWF0cml4V29ybGQpO1xuICAgIGNoaWxkSW52ZXJzZS5nZXRJbnZlcnNlKGNoaWxkUmVsYXRpdmVUb1BhcmVudCk7XG4gICAgbmV3UGFyZW50TWF0cml4Lm11bHRpcGx5TWF0cmljZXModGFyZ2V0LCBjaGlsZEludmVyc2UpO1xuICAgIHNldE1hdHJpeFdvcmxkKHBhcmVudCwgbmV3UGFyZW50TWF0cml4KTtcbiAgfTtcbn0pKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmF2ZXJzZUFuaW1hdGlvblRhcmdldHMocm9vdE9iamVjdCwgYW5pbWF0aW9ucywgY2FsbGJhY2spIHtcbiAgaWYgKGFuaW1hdGlvbnMgJiYgYW5pbWF0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgZm9yIChjb25zdCBhbmltYXRpb24gb2YgYW5pbWF0aW9ucykge1xuICAgICAgZm9yIChjb25zdCB0cmFjayBvZiBhbmltYXRpb24udHJhY2tzKSB7XG4gICAgICAgIGNvbnN0IHsgbm9kZU5hbWUgfSA9IFRIUkVFLlByb3BlcnR5QmluZGluZy5wYXJzZVRyYWNrTmFtZSh0cmFjay5uYW1lKTtcbiAgICAgICAgbGV0IGFuaW1hdGVkTm9kZSA9IHJvb3RPYmplY3QuZ2V0T2JqZWN0QnlQcm9wZXJ0eShcInV1aWRcIiwgbm9kZU5hbWUpO1xuXG4gICAgICAgIGlmICghYW5pbWF0ZWROb2RlKSB7XG4gICAgICAgICAgYW5pbWF0ZWROb2RlID0gcm9vdE9iamVjdC5nZXRPYmplY3RCeU5hbWUobm9kZU5hbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFuaW1hdGVkTm9kZSkge1xuICAgICAgICAgIGNhbGxiYWNrKGFuaW1hdGVkTm9kZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7XG4gICAgc2V0TWF0cml4V29ybGRcbn0gZnJvbSBcIi4uL3V0aWxzL3RocmVlLXV0aWxzXCI7XG5pbXBvcnQge1xuICAgIGZpbmRBbmNlc3RvcldpdGhDb21wb25lbnRcbn0gZnJvbSBcIi4uL3V0aWxzL3NjZW5lLWdyYXBoXCI7XG5cbmNvbnN0IGNhbGN1bGF0ZVBsYW5lTWF0cml4ID0gKGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBwbGFuZU1hdHJpeCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gICAgY29uc3QgcGxhbmVVcCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgY29uc3QgcGxhbmVGb3J3YXJkID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICBjb25zdCBwbGFuZVJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICBjb25zdCBwbGFuZVBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICBjb25zdCBjYW1Qb3NpdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gY2FsY3VsYXRlUGxhbmVNYXRyaXgoY2FtZXJhLCBidXR0b24pIHtcbiAgICAgICAgY2FtZXJhLnVwZGF0ZU1hdHJpY2VzKCk7XG4gICAgICAgIGNhbVBvc2l0aW9uLnNldEZyb21NYXRyaXhQb3NpdGlvbihjYW1lcmEubWF0cml4V29ybGQpO1xuICAgICAgICBidXR0b24udXBkYXRlTWF0cmljZXMoKTtcbiAgICAgICAgcGxhbmVQb3NpdGlvbi5zZXRGcm9tTWF0cml4UG9zaXRpb24oYnV0dG9uLm1hdHJpeFdvcmxkKTtcbiAgICAgICAgcGxhbmVGb3J3YXJkLnN1YlZlY3RvcnMocGxhbmVQb3NpdGlvbiwgY2FtUG9zaXRpb24pO1xuICAgICAgICBwbGFuZUZvcndhcmQueSA9IDA7XG4gICAgICAgIHBsYW5lRm9yd2FyZC5ub3JtYWxpemUoKTtcbiAgICAgICAgcGxhbmVVcC5zZXQoMCwgMSwgMCk7XG4gICAgICAgIHBsYW5lUmlnaHQuY3Jvc3NWZWN0b3JzKHBsYW5lRm9yd2FyZCwgcGxhbmVVcCk7XG4gICAgICAgIHBsYW5lTWF0cml4Lm1ha2VCYXNpcyhwbGFuZVJpZ2h0LCBwbGFuZVVwLCBwbGFuZUZvcndhcmQubXVsdGlwbHlTY2FsYXIoLTEpKTtcbiAgICAgICAgcGxhbmVNYXRyaXguZWxlbWVudHNbMTJdID0gcGxhbmVQb3NpdGlvbi54O1xuICAgICAgICBwbGFuZU1hdHJpeC5lbGVtZW50c1sxM10gPSBwbGFuZVBvc2l0aW9uLnk7XG4gICAgICAgIHBsYW5lTWF0cml4LmVsZW1lbnRzWzE0XSA9IHBsYW5lUG9zaXRpb24uejtcbiAgICAgICAgcmV0dXJuIHBsYW5lTWF0cml4O1xuICAgIH07XG59KSgpO1xuXG5jb25zdCBwbGFuZUZvckxlZnRDdXJzb3IgPSBuZXcgVEhSRUUuTWVzaChcbiAgICBuZXcgVEhSRUUuUGxhbmVCdWZmZXJHZW9tZXRyeSgxMDAwMDAsIDEwMDAwMCwgMiwgMiksXG4gICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgdmlzaWJsZTogdHJ1ZSxcbiAgICAgICAgd2lyZWZyYW1lOiBmYWxzZSxcbiAgICAgICAgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcbiAgICAgICAgdHJhbnNwYXJlbnQ6IHRydWUsXG4gICAgICAgIG9wYWNpdHk6IDAuM1xuICAgIH0pXG4pO1xuY29uc3QgcGxhbmVGb3JSaWdodEN1cnNvciA9IG5ldyBUSFJFRS5NZXNoKFxuICAgIG5ldyBUSFJFRS5QbGFuZUJ1ZmZlckdlb21ldHJ5KDEwMDAwMCwgMTAwMDAwLCAyLCAyKSxcbiAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICB2aXNpYmxlOiB0cnVlLFxuICAgICAgICB3aXJlZnJhbWU6IGZhbHNlLFxuICAgICAgICBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlLFxuICAgICAgICB0cmFuc3BhcmVudDogdHJ1ZSxcbiAgICAgICAgb3BhY2l0eTogMC4zXG4gICAgfSlcbik7XG5cbmV4cG9ydCBjbGFzcyBIYW5kbGVJbnRlcmFjdGlvbiB7XG4gICAgY29uc3RydWN0b3IoZWwpIHtcbiAgICAgICAgdGhpcy5lbCA9IGVsO1xuXG4gICAgICAgIHRoaXMuaXNEcmFnZ2luZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLmRyYWdJbnRlcmFjdG9yID0gbnVsbDtcbiAgICAgICAgdGhpcy5wbGFuZVJvdGF0aW9uID0gbmV3IFRIUkVFLk1hdHJpeDQoKTtcbiAgICAgICAgdGhpcy5wbGFuZVVwID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICAgICAgdGhpcy5wbGFuZVJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICAgICAgdGhpcy5pbnRlcnNlY3Rpb25zID0gW107XG4gICAgICAgIHRoaXMuaW5pdGlhbEludGVyc2VjdGlvblBvaW50ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICAgICAgdGhpcy5pbnRlcnNlY3Rpb25Qb2ludCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgICAgIHRoaXMuZGVsdGEgPSB7XG4gICAgICAgICAgICB4OiAwLFxuICAgICAgICAgICAgeTogMFxuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9iamVjdE1hdHJpeCA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG4gICAgICAgIHRoaXMuZHJhZ1ZlY3RvciA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5cbiAgICAgICAgdGhpcy5jYW1Qb3NpdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG4gICAgICAgIHRoaXMub2JqZWN0UG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuICAgICAgICB0aGlzLm9iamVjdFRvQ2FtID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICB9XG5cbiAgICBnZXRJbnRlcmFjdG9ycyhvYmopIHtcbiAgICAgICAgbGV0IHRvZ2dsaW5nID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXNbXCJodWJzLXN5c3RlbXNcIl0uY3Vyc29yVG9nZ2xpbmdTeXN0ZW07XG5cbiAgICAgICAgLy8gbW9yZSBvciBsZXNzIGNvcGllZCBmcm9tIFwiaG92ZXJhYmxlLXZpc3VhbHMuanNcIiBpbiBodWJzXG4gICAgICAgIGNvbnN0IGludGVyYWN0aW9uID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXMuaW50ZXJhY3Rpb247XG4gICAgICAgIHZhciBwYXNzdGhydUludGVyYWN0b3IgPSBbXVxuXG4gICAgICAgIGxldCBpbnRlcmFjdG9yT25lLCBpbnRlcmFjdG9yVHdvO1xuICAgICAgICBpZiAoIWludGVyYWN0aW9uLnJlYWR5KSByZXR1cm47IC8vRE9NQ29udGVudFJlYWR5IHdvcmthcm91bmRcblxuICAgICAgICAvLyBUT0RPOiAgbWF5IHdhbnQgdG8gbG9vayB0byBzZWUgdGhlIGhvdmVyZWQgb2JqZWN0cyBhcmUgY2hpbGRyZW4gb2Ygb2JqPz9cbiAgICAgICAgbGV0IGhvdmVyRWwgPSBvYmpcbiAgICAgICAgaWYgKGludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhvdmVyZWQgPT09IGhvdmVyRWwgJiYgIWludGVyYWN0aW9uLnN0YXRlLmxlZnRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgIGludGVyYWN0b3JPbmUgPSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yOiBpbnRlcmFjdGlvbi5vcHRpb25zLmxlZnRIYW5kLmVudGl0eS5vYmplY3QzRCxcbiAgICAgICAgICAgICAgICBjb250cm9sbGVyOiBpbnRlcmFjdGlvbi5sZWZ0Q3Vyc29yQ29udHJvbGxlckVsLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLmxlZnRSZW1vdGUuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJlxuICAgICAgICAgICAgIWludGVyYWN0aW9uLnN0YXRlLmxlZnRSZW1vdGUuaGVsZCAmJlxuICAgICAgICAgICAgIXRvZ2dsaW5nLmxlZnRUb2dnbGVkT2ZmXG4gICAgICAgICkge1xuICAgICAgICAgICAgaW50ZXJhY3Rvck9uZSA9IHtcbiAgICAgICAgICAgICAgICBjdXJzb3I6IGludGVyYWN0aW9uLm9wdGlvbnMubGVmdFJlbW90ZS5lbnRpdHkub2JqZWN0M0QsXG4gICAgICAgICAgICAgICAgY29udHJvbGxlcjogaW50ZXJhY3Rpb24ubGVmdEN1cnNvckNvbnRyb2xsZXJFbC5jb21wb25lbnRzW1wiY3Vyc29yLWNvbnRyb2xsZXJcIl1cbiAgICAgICAgICAgIH1cblxuICAgICAgICB9XG4gICAgICAgIGlmIChpbnRlcmFjdG9yT25lKSB7XG4gICAgICAgICAgICBwYXNzdGhydUludGVyYWN0b3IucHVzaChpbnRlcmFjdG9yT25lKVxuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIGludGVyYWN0aW9uLnN0YXRlLnJpZ2h0UmVtb3RlLmhvdmVyZWQgPT09IGhvdmVyRWwgJiZcbiAgICAgICAgICAgICFpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodFJlbW90ZS5oZWxkICYmXG4gICAgICAgICAgICAhdG9nZ2xpbmcucmlnaHRUb2dnbGVkT2ZmXG4gICAgICAgICkge1xuICAgICAgICAgICAgaW50ZXJhY3RvclR3byA9IHtcbiAgICAgICAgICAgICAgICBjdXJzb3I6IGludGVyYWN0aW9uLm9wdGlvbnMucmlnaHRSZW1vdGUuZW50aXR5Lm9iamVjdDNELFxuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXI6IGludGVyYWN0aW9uLnJpZ2h0Q3Vyc29yQ29udHJvbGxlckVsLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpbnRlcmFjdGlvbi5zdGF0ZS5yaWdodEhhbmQuaG92ZXJlZCA9PT0gaG92ZXJFbCAmJiAhaW50ZXJhY3Rpb24uc3RhdGUucmlnaHRIYW5kLmhlbGQpIHtcbiAgICAgICAgICAgIGludGVyYWN0b3JUd28gPSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yOiBpbnRlcmFjdGlvbi5vcHRpb25zLnJpZ2h0SGFuZC5lbnRpdHkub2JqZWN0M0QsXG4gICAgICAgICAgICAgICAgY29udHJvbGxlcjogaW50ZXJhY3Rpb24ucmlnaHRDdXJzb3JDb250cm9sbGVyRWwuY29tcG9uZW50c1tcImN1cnNvci1jb250cm9sbGVyXCJdXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGludGVyYWN0b3JUd28pIHtcbiAgICAgICAgICAgIHBhc3N0aHJ1SW50ZXJhY3Rvci5wdXNoKGludGVyYWN0b3JUd28pXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHBhc3N0aHJ1SW50ZXJhY3RvclxuICAgIH1cblxuICAgIGdldFJlZnMoKSB7XG4gICAgICAgIGlmICghdGhpcy5kaWRHZXRPYmplY3RSZWZlcmVuY2VzKSB7XG4gICAgICAgICAgICB0aGlzLmRpZEdldE9iamVjdFJlZmVyZW5jZXMgPSB0cnVlO1xuICAgICAgICAgICAgY29uc3QgaW50ZXJhY3Rpb24gPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5pbnRlcmFjdGlvbjtcblxuICAgICAgICAgICAgLy8gdGhpcy5sZWZ0RXZlbnRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGVmdC1jdXJzb3JcIikub2JqZWN0M0Q7XG4gICAgICAgICAgICAvLyB0aGlzLmxlZnRDdXJzb3JDb250cm9sbGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsZWZ0LWN1cnNvci1jb250cm9sbGVyXCIpO1xuICAgICAgICAgICAgLy8gdGhpcy5sZWZ0UmF5Y2FzdGVyID0gdGhpcy5sZWZ0Q3Vyc29yQ29udHJvbGxlci5jb21wb25lbnRzW1wiY3Vyc29yLWNvbnRyb2xsZXJcIl0ucmF5Y2FzdGVyO1xuICAgICAgICAgICAgLy8gdGhpcy5yaWdodEN1cnNvckNvbnRyb2xsZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJpZ2h0LWN1cnNvci1jb250cm9sbGVyXCIpO1xuICAgICAgICAgICAgLy8gdGhpcy5yaWdodFJheWNhc3RlciA9IHRoaXMucmlnaHRDdXJzb3JDb250cm9sbGVyLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXS5yYXljYXN0ZXI7XG4gICAgICAgICAgICB0aGlzLmxlZnRFdmVudGVyID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5sZWZ0UmVtb3RlLmVudGl0eS5vYmplY3QzRDtcbiAgICAgICAgICAgIHRoaXMubGVmdEN1cnNvckNvbnRyb2xsZXIgPSBpbnRlcmFjdGlvbi5sZWZ0Q3Vyc29yQ29udHJvbGxlckVsLmNvbXBvbmVudHNbXCJjdXJzb3ItY29udHJvbGxlclwiXTtcbiAgICAgICAgICAgIHRoaXMubGVmdFJheWNhc3RlciA9IHRoaXMubGVmdEN1cnNvckNvbnRyb2xsZXIucmF5Y2FzdGVyO1xuICAgICAgICAgICAgdGhpcy5yaWdodEN1cnNvckNvbnRyb2xsZXIgPSBpbnRlcmFjdGlvbi5yaWdodEN1cnNvckNvbnRyb2xsZXJFbC5jb21wb25lbnRzW1wiY3Vyc29yLWNvbnRyb2xsZXJcIl07XG4gICAgICAgICAgICB0aGlzLnJpZ2h0UmF5Y2FzdGVyID0gdGhpcy5yaWdodEN1cnNvckNvbnRyb2xsZXIucmF5Y2FzdGVyO1xuXG4gICAgICAgICAgICB0aGlzLnZpZXdpbmdDYW1lcmEgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInZpZXdpbmctY2FtZXJhXCIpLm9iamVjdDNETWFwLmNhbWVyYTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldEludGVyc2VjdGlvbihpbnRlcmFjdG9yLCB0YXJnZXRzKSB7XG4gICAgICAgIHRoaXMuZ2V0UmVmcygpO1xuICAgICAgICBsZXQgb2JqZWN0M0QgPSBpbnRlcmFjdG9yLmN1cnNvclxuICAgICAgICBsZXQgcmF5Y2FzdGVyID0gb2JqZWN0M0QgPT09IHRoaXMubGVmdEV2ZW50ZXIgPyB0aGlzLmxlZnRSYXljYXN0ZXIgOiB0aGlzLnJpZ2h0UmF5Y2FzdGVyO1xuXG4gICAgICAgIGxldCBpbnRlcnNlY3RzID0gcmF5Y2FzdGVyLmludGVyc2VjdE9iamVjdHModGFyZ2V0cywgdHJ1ZSk7XG4gICAgICAgIGlmIChpbnRlcnNlY3RzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHJldHVybiBpbnRlcnNlY3RzWzBdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHN0YXJ0RHJhZyhlLCBvYmplY3QzRCwgaW50ZXJzZWN0aW9uKSB7XG4gICAgICAgIGlmICh0aGlzLmlzRHJhZ2dpbmcpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmdldFJlZnMoKTtcbiAgICAgICAgb2JqZWN0M0QgPSBvYmplY3QzRCB8fCB0aGlzLmVsLm9iamVjdDNEO1xuICAgICAgICB0aGlzLnJheWNhc3RlciA9IGUub2JqZWN0M0QgPT09IHRoaXMubGVmdEV2ZW50ZXIgPyB0aGlzLmxlZnRSYXljYXN0ZXIgOiB0aGlzLnJpZ2h0UmF5Y2FzdGVyO1xuXG4gICAgICAgIGlmICghaW50ZXJzZWN0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnBsYW5lID0gZS5vYmplY3QzRCA9PT0gdGhpcy5sZWZ0RXZlbnRlciA/IHBsYW5lRm9yTGVmdEN1cnNvciA6IHBsYW5lRm9yUmlnaHRDdXJzb3I7XG4gICAgICAgICAgICBzZXRNYXRyaXhXb3JsZCh0aGlzLnBsYW5lLCBjYWxjdWxhdGVQbGFuZU1hdHJpeCh0aGlzLnZpZXdpbmdDYW1lcmEsIG9iamVjdDNEKSk7XG4gICAgICAgICAgICB0aGlzLnBsYW5lUm90YXRpb24uZXh0cmFjdFJvdGF0aW9uKHRoaXMucGxhbmUubWF0cml4V29ybGQpO1xuICAgICAgICAgICAgdGhpcy5wbGFuZVVwLnNldCgwLCAxLCAwKS5hcHBseU1hdHJpeDQodGhpcy5wbGFuZVJvdGF0aW9uKTtcbiAgICAgICAgICAgIHRoaXMucGxhbmVSaWdodC5zZXQoMSwgMCwgMCkuYXBwbHlNYXRyaXg0KHRoaXMucGxhbmVSb3RhdGlvbik7XG4gICAgICAgICAgICBpbnRlcnNlY3Rpb24gPSB0aGlzLnJheWNhc3RPblBsYW5lKCk7XG5cbiAgICAgICAgICAgIC8vIHNob3VsZG4ndCBoYXBwZW4sIGJ1dCB3ZSBzaG91bGQgY2hlY2tcbiAgICAgICAgICAgIGlmICghaW50ZXJzZWN0aW9uKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnBsYW5lID0gbnVsbFxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5pc0RyYWdnaW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5kcmFnSW50ZXJhY3RvciA9IHtcbiAgICAgICAgICAgIGN1cnNvcjogZS5vYmplY3QzRCxcbiAgICAgICAgICAgIGNvbnRyb2xsZXI6IGUub2JqZWN0M0QgPT09IHRoaXMubGVmdEV2ZW50ZXIgPyB0aGlzLmxlZnRDdXJzb3JDb250cm9sbGVyIDogdGhpcy5yaWdodEN1cnNvckNvbnRyb2xsZXIsXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmluaXRpYWxJbnRlcnNlY3Rpb25Qb2ludC5jb3B5KGludGVyc2VjdGlvbi5wb2ludCk7XG4gICAgICAgIHRoaXMuaW5pdGlhbERpc3RhbmNlVG9PYmplY3QgPSB0aGlzLm9iamVjdFRvQ2FtXG4gICAgICAgICAgICAuc3ViVmVjdG9ycyhcbiAgICAgICAgICAgICAgICB0aGlzLmNhbVBvc2l0aW9uLnNldEZyb21NYXRyaXhQb3NpdGlvbih0aGlzLnZpZXdpbmdDYW1lcmEubWF0cml4V29ybGQpLFxuICAgICAgICAgICAgICAgIHRoaXMub2JqZWN0UG9zaXRpb24uc2V0RnJvbU1hdHJpeFBvc2l0aW9uKG9iamVjdDNELm1hdHJpeFdvcmxkKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLmxlbmd0aCgpO1xuICAgICAgICB0aGlzLmludGVyc2VjdGlvblJpZ2h0ID0gMDtcbiAgICAgICAgdGhpcy5pbnRlcnNlY3Rpb25VcCA9IDA7XG4gICAgICAgIHRoaXMuZGVsdGEgPSB7XG4gICAgICAgICAgICB4OiAwLFxuICAgICAgICAgICAgeTogMFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgZW5kRHJhZyhlKSB7XG4gICAgICAgIGlmICghdGhpcy5pc0RyYWdnaW5nKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgKGUub2JqZWN0M0QgPT09IHRoaXMubGVmdEV2ZW50ZXIgJiYgdGhpcy5yYXljYXN0ZXIgPT09IHRoaXMubGVmdFJheWNhc3RlcikgfHxcbiAgICAgICAgICAgIChlLm9iamVjdDNEICE9PSB0aGlzLmxlZnRFdmVudGVyICYmIHRoaXMucmF5Y2FzdGVyID09PSB0aGlzLnJpZ2h0UmF5Y2FzdGVyKVxuICAgICAgICApIHtcbiAgICAgICAgICAgIHRoaXMuaXNEcmFnZ2luZyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5kcmFnSW50ZXJhY3RvciA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByYXljYXN0T25QbGFuZSgpIHtcbiAgICAgICAgdGhpcy5pbnRlcnNlY3Rpb25zLmxlbmd0aCA9IDA7XG4gICAgICAgIGNvbnN0IGZhciA9IHRoaXMucmF5Y2FzdGVyLmZhcjtcbiAgICAgICAgdGhpcy5yYXljYXN0ZXIuZmFyID0gMTAwMDtcbiAgICAgICAgdGhpcy5wbGFuZS5yYXljYXN0KHRoaXMucmF5Y2FzdGVyLCB0aGlzLmludGVyc2VjdGlvbnMpO1xuICAgICAgICB0aGlzLnJheWNhc3Rlci5mYXIgPSBmYXI7XG4gICAgICAgIHJldHVybiB0aGlzLmludGVyc2VjdGlvbnNbMF07XG4gICAgfVxuXG4gICAgZHJhZygpIHtcbiAgICAgICAgaWYgKCF0aGlzLmlzRHJhZ2dpbmcpIHJldHVybiBudWxsO1xuICAgICAgICBpZiAodGhpcy5wbGFuZSkge1xuICAgICAgICAgICAgY29uc3QgaW50ZXJzZWN0aW9uID0gdGhpcy5yYXljYXN0T25QbGFuZSgpO1xuICAgICAgICAgICAgaWYgKCFpbnRlcnNlY3Rpb24pIHJldHVybiBudWxsO1xuICAgICAgICAgICAgdGhpcy5pbnRlcnNlY3Rpb25Qb2ludC5jb3B5KGludGVyc2VjdGlvbi5wb2ludCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmludGVyc2VjdGlvblBvaW50ID0gdGhpcy5yYXljYXN0ZXIucmF5Lm9yaWdpbi5jbG9uZSgpXG4gICAgICAgICAgICB0aGlzLmludGVyc2VjdGlvblBvaW50LmFkZFNjYWxlZFZlY3Rvcih0aGlzLnJheWNhc3Rlci5yYXkuZGlyZWN0aW9uLCB0aGlzLmluaXRpYWxEaXN0YW5jZVRvT2JqZWN0KTsgICAgXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5kcmFnVmVjdG9yLnN1YlZlY3RvcnModGhpcy5pbnRlcnNlY3Rpb25Qb2ludCwgdGhpcy5pbml0aWFsSW50ZXJzZWN0aW9uUG9pbnQpO1xuXG4gICAgICAgIC8vIGRlbHRhIGRvZXNuJ3QgbWFrZSBtdWNoIHNlbnNlIGZvciBub24tcGxhbmFyIGRyYWdnaW5nLCBidXQgYXNzaWduIHNvbWV0aGluZyBhbnl3YXlcbiAgICAgICAgdGhpcy5kZWx0YS54ID0gdGhpcy5wbGFuZSA/IHRoaXMuZHJhZ1ZlY3Rvci5kb3QodGhpcy5wbGFuZVVwKSA6IHRoaXMuZHJhZ1ZlY3Rvci54O1xuICAgICAgICB0aGlzLmRlbHRhLnkgPSB0aGlzLnBsYW5lID8gdGhpcy5kcmFnVmVjdG9yLmRvdCh0aGlzLnBsYW5lUmlnaHQpIDogdGhpcy5kcmFnVmVjdG9yLnk7XG4gICAgICAgIHJldHVybiB0aGlzLmRyYWdWZWN0b3I7XG4gICAgfVxufVxuXG5cbi8vIHRlbXBsYXRlXG5cbmV4cG9ydCBmdW5jdGlvbiBpbnRlcmFjdGl2ZUNvbXBvbmVudFRlbXBsYXRlKGNvbXBvbmVudE5hbWUpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBzdGFydEluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLmNsYXNzTmFtZVxuICAgICAgICAgICAgdGhpcy5yZWxhdGl2ZVNpemUgPSAxO1xuICAgICAgICAgICAgdGhpcy5pc0RyYWdnYWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5pc0ludGVyYWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLmlzTmV0d29ya2VkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vIHNvbWUgbWV0aG9kc1xuICAgICAgICAgICAgdGhpcy5pbnRlcm5hbENsaWNrZWQgPSB0aGlzLmludGVybmFsQ2xpY2tlZC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5pbnRlcm5hbERyYWdTdGFydCA9IHRoaXMuaW50ZXJuYWxEcmFnU3RhcnQuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuaW50ZXJuYWxEcmFnRW5kID0gdGhpcy5pbnRlcm5hbERyYWdFbmQuYmluZCh0aGlzKTtcbiAgICAgICAgfSwgICAgICAgIFxuICAgICAgICBcbiAgICAgICAgZmluaXNoSW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbGV0IHJvb3QgPSBmaW5kQW5jZXN0b3JXaXRoQ29tcG9uZW50KHRoaXMuZWwsIFwiZ2x0Zi1tb2RlbC1wbHVzXCIpXG4gICAgICAgICAgICByb290ICYmIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcihcIm1vZGVsLWxvYWRlZFwiLCAoZXYpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmludGVybmFsSW5pdCgpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcblxuICAgICAgICBpbnRlcm5hbENsaWNrZWQ6IGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICAgICAgdGhpcy5jbGlja2VkICYmIHRoaXMuY2xpY2tlZChldnQpXG4gICAgICAgIH0sXG5cbiAgICAgICAgaW50ZXJuYWxEcmFnU3RhcnQ6IGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICAgICAgdGhpcy5kcmFnU3RhcnQoZXZ0KVxuICAgICAgICB9LFxuXG4gICAgICAgIGludGVybmFsRHJhZ0VuZDogZnVuY3Rpb24oZXZ0KSB7XG4gICAgICAgICAgICB0aGlzLmRyYWdFbmQoZXZ0KVxuICAgICAgICB9LFxuXG4gICAgICAgIHJlbW92ZVRlbXBsYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5pc0ludGVyYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QucmVtb3ZlRXZlbnRMaXN0ZW5lcignaW50ZXJhY3QnLCB0aGlzLmludGVybmFsQ2xpY2tlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVsLnJlbW92ZUNoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIgPSBudWxsXG4gICAgXG4gICAgICAgICAgICBpZiAodGhpcy5pc05ldHdvcmtlZCAmJiB0aGlzLm5ldEVudGl0eS5wYXJlbnROb2RlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5uZXRFbnRpdHkucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLm5ldEVudGl0eSlcbiAgICAgICAgICAgIH0gICAgXG4gICAgICAgIH0sXG5cbiAgICAgICAgaW50ZXJuYWxJbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAvLyBlYWNoIHRpbWUgd2UgbG9hZCBhIGNvbXBvbmVudCB3ZSB3aWxsIHBvc3NpYmx5IGNyZWF0ZVxuICAgICAgICAgICAgLy8gYSBuZXcgbmV0d29ya2VkIGNvbXBvbmVudC4gIFRoaXMgaXMgZmluZSwgc2luY2UgdGhlIG5ldHdvcmtlZCBJZCBcbiAgICAgICAgICAgIC8vIGlzIGJhc2VkIG9uIHRoZSBuYW1lIHBhc3NlZCBhcyBhIHBhcmFtZXRlciwgb3IgYXNzaWduZWQgdG8gdGhlXG4gICAgICAgICAgICAvLyBjb21wb25lbnQgaW4gU3Bva2UuICBJdCBkb2VzIG1lYW4gdGhhdCBpZiB3ZSBoYXZlXG4gICAgICAgICAgICAvLyBtdWx0aXBsZSBvYmplY3RzIGluIHRoZSBzY2VuZSB3aGljaCBoYXZlIHRoZSBzYW1lIG5hbWUsIHRoZXkgd2lsbFxuICAgICAgICAgICAgLy8gYmUgaW4gc3luYy4gIEl0IGFsc28gbWVhbnMgdGhhdCBpZiB5b3Ugd2FudCB0byBkcm9wIGEgY29tcG9uZW50IG9uXG4gICAgICAgICAgICAvLyB0aGUgc2NlbmUgdmlhIGEgLmdsYiwgaXQgbXVzdCBoYXZlIGEgdmFsaWQgbmFtZSBwYXJhbWV0ZXIgaW5zaWRlIGl0LlxuICAgICAgICAgICAgLy8gQSAuZ2xiIGluIHNwb2tlIHdpbGwgZmFsbCBiYWNrIHRvIHRoZSBzcG9rZSBuYW1lIGlmIHlvdSB1c2Ugb25lIHdpdGhvdXRcbiAgICAgICAgICAgIC8vIGEgbmFtZSBpbnNpZGUgaXQuXG4gICAgICAgICAgICBsZXQgbG9hZGVyID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIGxldHMgbG9hZCBzb21ldGhpbmcgZXh0ZXJuYWxseSwgbGlrZSBhIGpzb24gY29uZmlnIGZpbGVcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWREYXRhKCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBnZXQgdGhlIHBhcmVudCBuZXR3b3JrZWQgZW50aXR5LCB3aGVuIGl0J3MgZmluaXNoZWQgaW5pdGlhbGl6aW5nLiAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBXaGVuIGNyZWF0aW5nIHRoaXMgYXMgcGFydCBvZiBhIEdMVEYgbG9hZCwgdGhlIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gcGFyZW50IGEgZmV3IHN0ZXBzIHVwIHdpbGwgYmUgbmV0d29ya2VkLiBcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubmV0RW50aXR5ID0gbnVsbFxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBiaW5kIGNhbGxiYWNrc1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5nZXRTaGFyZWREYXRhID0gdGhpcy5nZXRTaGFyZWREYXRhLmJpbmQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gc2V0IHVwIHRoZSBsb2NhbCBjb250ZW50IGFuZCBob29rIGl0IHRvIHRoZSBzY2VuZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EtZW50aXR5JylcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QubWF0cml4QXV0b1VwZGF0ZSA9IHRydWVcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmluaXRpYWxpemVEYXRhKClcbiAgICAgICAgICAgICAgICAgICAgLy8gbGV0cyBmaWd1cmUgb3V0IHRoZSBzY2FsZSwgYnkgc2NhbGluZyB0byBmaWxsIHRoZSBhIDF4MW0gc3F1YXJlLCB0aGF0IGhhcyBhbHNvXG4gICAgICAgICAgICAgICAgICAgIC8vIHBvdGVudGlhbGx5IGJlZW4gc2NhbGVkIGJ5IHRoZSBwYXJlbnRzIHBhcmVudCBub2RlLiBJZiB3ZSBzY2FsZSB0aGUgZW50aXR5IGluIHNwb2tlLFxuICAgICAgICAgICAgICAgICAgICAvLyB0aGlzIGlzIHdoZXJlIHRoZSBzY2FsZSBpcyBzZXQuICBJZiB3ZSBkcm9wIGEgbm9kZSBpbiBhbmQgc2NhbGUgaXQsIHRoZSBzY2FsZSBpcyBhbHNvXG4gICAgICAgICAgICAgICAgICAgIC8vIHNldCB0aGVyZS5cblxuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBuZWVkIHRvIGZpbmQgZW52aXJvbm1lbnQtc2NlbmUsIGdvIGRvd24gdHdvIGxldmVscyB0byB0aGUgZ3JvdXAgYWJvdmUgXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoZSBub2RlcyBpbiB0aGUgc2NlbmUuICBUaGVuIGFjY3VtdWxhdGUgdGhlIHNjYWxlcyB1cCBmcm9tIHRoaXMgbm9kZSB0b1xuICAgICAgICAgICAgICAgICAgICAvLyB0aGF0IG5vZGUuICBUaGlzIHdpbGwgYWNjb3VudCBmb3IgZ3JvdXBzLCBhbmQgbmVzdGluZy5cblxuICAgICAgICAgICAgICAgICAgICB2YXIgd2lkdGggPSAxLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50c1tcIm1lZGlhLWltYWdlXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBhdHRhY2hlZCB0byBhbiBpbWFnZSBpbiBzcG9rZSwgc28gdGhlIGltYWdlIG1lc2ggaXMgc2l6ZSAxIGFuZCBpcyBzY2FsZWQgZGlyZWN0bHlcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBzY2FsZU0gPSB0aGlzLmVsLm9iamVjdDNETWFwW1wibWVzaFwiXS5zY2FsZVxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHNjYWxlSSA9IHRoaXMuZWwub2JqZWN0M0Quc2NhbGVcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoID0gc2NhbGVNLnggKiBzY2FsZUkueFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0ID0gc2NhbGVNLnkgKiBzY2FsZUkueVxuICAgICAgICAgICAgICAgICAgICAgICAgc2NhbGVJLnggPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICBzY2FsZUkueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjYWxlSS56ID0gMVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBQUk9CQUJMWSBET05UIE5FRUQgVE8gU1VQUE9SVCBUSElTIEFOWU1PUkVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGl0J3MgZW1iZWRkZWQgaW4gYSBzaW1wbGUgZ2x0ZiBtb2RlbDsgIG90aGVyIG1vZGVscyBtYXkgbm90IHdvcmtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIGFzc3VtZSBpdCdzIGF0IHRoZSB0b3AgbGV2ZWwgbWVzaCwgYW5kIHRoYXQgdGhlIG1vZGVsIGl0c2VsZiBpcyBzY2FsZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBtZXNoID0gdGhpcy5lbC5vYmplY3QzRE1hcFtcIm1lc2hcIl1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtZXNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGJveCA9IG1lc2guZ2VvbWV0cnkuYm91bmRpbmdCb3g7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggPSAoYm94Lm1heC54IC0gYm94Lm1pbi54KSAqIG1lc2guc2NhbGUueFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IChib3gubWF4LnkgLSBib3gubWluLnkpICogbWVzaC5zY2FsZS55XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBtZXNoU2NhbGUgPSB0aGlzLmVsLm9iamVjdDNELnNjYWxlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGggPSBtZXNoU2NhbGUueFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCA9IG1lc2hTY2FsZS55XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnggPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnkgPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzaFNjYWxlLnogPSAxXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5tYXRyaXhOZWVkc1VwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSB0aGUgcm9vdCBnbHRmIHNjYWxlLlxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHBhcmVudDIgPSB0aGlzLmVsLnBhcmVudEVsLnBhcmVudEVsLm9iamVjdDNEXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aCAqPSBwYXJlbnQyLnNjYWxlLnhcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodCAqPSBwYXJlbnQyLnNjYWxlLnlcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueCA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueSA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDIuc2NhbGUueiA9IDFcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDIubWF0cml4TmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHdpZHRoID4gMCAmJiBoZWlnaHQgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgc2NhbGUgPSBNYXRoLm1pbih3aWR0aCAqIHRoaXMucmVsYXRpdmVTaXplLCBoZWlnaHQgKiB0aGlzLnJlbGF0aXZlU2l6ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2ltcGxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZShcInNjYWxlXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiBzY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiBzY2FsZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB6OiBzY2FsZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyB0aGVyZSBtaWdodCBiZSBzb21lIGVsZW1lbnRzIGFscmVhZHksIGxpa2UgdGhlIGN1YmUgd2UgY3JlYXRlZCBpbiBibGVuZGVyXG4gICAgICAgICAgICAgICAgICAgIC8vIGFuZCBhdHRhY2hlZCB0aGlzIGNvbXBvbmVudCB0bywgc28gaGlkZSB0aGVtIGlmIHRoZXkgYXJlIHRoZXJlLlxuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGMgb2YgdGhpcy5lbC5vYmplY3QzRC5jaGlsZHJlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgYy52aXNpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBhZGQgaW4gb3VyIGNvbnRhaW5lclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmFwcGVuZENoaWxkKHRoaXMuc2ltcGxlQ29udGFpbmVyKVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86ICB3ZSBhcmUgZ29pbmcgdG8gaGF2ZSB0byBtYWtlIHN1cmUgdGhpcyB3b3JrcyBpZiBcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGNvbXBvbmVudCBpcyBPTiBhbiBpbnRlcmFjdGFibGUgKGxpa2UgYW4gaW1hZ2UpXG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNJbnRlcmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVJbnRlcmFjdGlvbiA9IG5ldyBIYW5kbGVJbnRlcmFjdGlvbih0aGlzLmVsKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbWFrZSB0aGUgb2JqZWN0IGNsaWNrYWJsZVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdpcy1yZW1vdGUtaG92ZXItdGFyZ2V0JywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlQWN0aW9uQnV0dG9uOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc3BlY3RhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzU3RhdGljOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvZ2dsZXNIb3ZlcmVkQWN0aW9uU2V0OiB0cnVlXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0QXR0cmlidXRlKCdjbGFzcycsIFwiaW50ZXJhY3RhYmxlXCIpXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGZvcndhcmQgdGhlICdpbnRlcmFjdCcgZXZlbnRzIHRvIG91ciBvYmplY3QgXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNsaWNrZWQgPSB0aGlzLmNsaWNrZWQuYmluZCh0aGlzKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaW50ZXJhY3QnLCB0aGlzLmludGVybmFsQ2xpY2tlZClcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNEcmFnZ2FibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBhcmVuJ3QgZ29pbmcgdG8gcmVhbGx5IGRlYWwgd2l0aCB0aGlzIHRpbGwgd2UgaGF2ZSBhIHVzZSBjYXNlLCBidXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSBjYW4gc2V0IGl0IHVwIGZvciBub3dcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhZ3MnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpbmdsZUFjdGlvbkJ1dHRvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNIb2xkYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaG9sZGFibGVCdXR0b246IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc3BlY3RhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1N0YXRpYzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9nZ2xlc0hvdmVyZWRBY3Rpb25TZXQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmFnU3RhcnQgPSB0aGlzLmRyYWdTdGFydC5iaW5kKHRoaXMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmFnRW5kID0gdGhpcy5kcmFnRW5kLmJpbmQodGhpcylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZUNvbnRhaW5lci5vYmplY3QzRC5hZGRFdmVudExpc3RlbmVyKCdob2xkYWJsZS1idXR0b24tZG93bicsIHRoaXMuaW50ZXJuYWxEcmFnU3RhcnQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuYWRkRXZlbnRMaXN0ZW5lcignaG9sZGFibGUtYnV0dG9uLXVwJywgdGhpcy5pbnRlcm5hbERyYWdFbmQpXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vdGhpcy5yYXljYXN0ZXIgPSBuZXcgVEhSRUUuUmF5Y2FzdGVyKClcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaG92ZXJSYXlMID0gbmV3IFRIUkVFLlJheSgpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmhvdmVyUmF5UiA9IG5ldyBUSFJFRS5SYXkoKVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbm8gaW50ZXJhY3Rpdml0eSwgcGxlYXNlXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5jbGFzc0xpc3QuY29udGFpbnMoXCJpbnRlcmFjdGFibGVcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoXCJpbnRlcmFjdGFibGVcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKFwiaXMtcmVtb3RlLWhvdmVyLXRhcmdldFwiKVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogdGhpcyBTSE9VTEQgd29yayBidXQgbWFrZSBzdXJlIGl0IHdvcmtzIGlmIHRoZSBlbCB3ZSBhcmUgb25cbiAgICAgICAgICAgICAgICAgICAgLy8gaXMgbmV0d29ya2VkLCBzdWNoIGFzIHdoZW4gYXR0YWNoZWQgdG8gYW4gaW1hZ2VcblxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5lbC5oYXNBdHRyaWJ1dGUoXCJuZXR3b3JrZWRcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWwucmVtb3ZlQXR0cmlidXRlKFwibmV0d29ya2VkXCIpXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5pc05ldHdvcmtlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBmdW5jdGlvbiBmaW5kcyBhbiBleGlzdGluZyBjb3B5IG9mIHRoZSBOZXR3b3JrZWQgRW50aXR5IChpZiB3ZSBhcmUgbm90IHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZmlyc3QgY2xpZW50IGluIHRoZSByb29tIGl0IHdpbGwgZXhpc3QgaW4gb3RoZXIgY2xpZW50cyBhbmQgYmUgY3JlYXRlZCBieSBOQUYpXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBvciBjcmVhdGUgYW4gZW50aXR5IGlmIHdlIGFyZSBmaXJzdC5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSBmdW5jdGlvbiAobmV0d29ya2VkRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgcGVyc2lzdGVudCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG5ldElkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXR3b3JrZWRFbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSB3aWxsIGJlIHBhcnQgb2YgYSBOZXR3b3JrZWQgR0xURiBpZiB0aGUgR0xURiB3YXMgZHJvcHBlZCBvbiB0aGUgc2NlbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3IgcGlubmVkIGFuZCBsb2FkZWQgd2hlbiB3ZSBlbnRlciB0aGUgcm9vbS4gIFVzZSB0aGUgbmV0d29ya2VkIHBhcmVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHBsdXMgYSBkaXNhbWJpZ3VhdGluZyBiaXQgb2YgdGV4dCB0byBjcmVhdGUgYSB1bmlxdWUgSWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldElkID0gTkFGLnV0aWxzLmdldE5ldHdvcmtJZChuZXR3b3JrZWRFbCkgKyBcIi1cIiArIGNvbXBvbmVudE5hbWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgd2UgbmVlZCB0byBjcmVhdGUgYW4gZW50aXR5LCB1c2UgdGhlIHNhbWUgcGVyc2lzdGVuY2UgYXMgb3VyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5ldHdvcmsgZW50aXR5ICh0cnVlIGlmIHBpbm5lZCwgZmFsc2UgaWYgbm90KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZXJzaXN0ZW50ID0gZW50aXR5LmNvbXBvbmVudHMubmV0d29ya2VkLmRhdGEucGVyc2lzdGVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzIG9ubHkgaGFwcGVucyBpZiB0aGlzIGNvbXBvbmVudCBpcyBvbiBhIHNjZW5lIGZpbGUsIHNpbmNlIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBlbGVtZW50cyBvbiB0aGUgc2NlbmUgYXJlbid0IG5ldHdvcmtlZC4gIFNvIGxldCdzIGFzc3VtZSBlYWNoIGVudGl0eSBpbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2NlbmUgd2lsbCBoYXZlIGEgdW5pcXVlIG5hbWUuICBBZGRpbmcgYSBiaXQgb2YgdGV4dCBzbyB3ZSBjYW4gZmluZCBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpbiB0aGUgRE9NIHdoZW4gZGVidWdnaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXRJZCA9IHRoaXMuZnVsbE5hbWUucmVwbGFjZUFsbChcIl9cIiwgXCItXCIpICsgXCItXCIgKyBjb21wb25lbnROYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNoZWNrIGlmIHRoZSBuZXR3b3JrZWQgZW50aXR5IHdlIGNyZWF0ZSBmb3IgdGhpcyBjb21wb25lbnQgYWxyZWFkeSBleGlzdHMuIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSwgY3JlYXRlIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gLSBOT1RFOiBpdCBpcyBjcmVhdGVkIG9uIHRoZSBzY2VuZSwgbm90IGFzIGEgY2hpbGQgb2YgdGhpcyBlbnRpdHksIGJlY2F1c2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgIE5BRiBjcmVhdGVzIHJlbW90ZSBlbnRpdGllcyBpbiB0aGUgc2NlbmUuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGVudGl0eTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoTkFGLmVudGl0aWVzLmhhc0VudGl0eShuZXRJZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gTkFGLmVudGl0aWVzLmdldEVudGl0eShuZXRJZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYS1lbnRpdHknKVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHN0b3JlIHRoZSBtZXRob2QgdG8gcmV0cmlldmUgdGhlIGRhdGEgb24gdGhpcyBlbnRpdHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW50aXR5LmdldFNoYXJlZERhdGEgPSB0aGlzLmdldFNoYXJlZERhdGE7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIFwibmV0d29ya2VkXCIgY29tcG9uZW50IHNob3VsZCBoYXZlIHBlcnNpc3RlbnQ9dHJ1ZSwgdGhlIHRlbXBsYXRlIGFuZCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbmV0d29ya0lkIHNldCwgb3duZXIgc2V0IHRvIFwic2NlbmVcIiAoc28gdGhhdCBpdCBkb2Vzbid0IHVwZGF0ZSB0aGUgcmVzdCBvZlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgd29ybGQgd2l0aCBpdCdzIGluaXRpYWwgZGF0YSwgYW5kIHNob3VsZCBOT1Qgc2V0IGNyZWF0b3IgKHRoZSBzeXN0ZW0gd2lsbCBkbyB0aGF0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnRpdHkuc2V0QXR0cmlidXRlKCduZXR3b3JrZWQnLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZTogXCIjXCIgKyBjb21wb25lbnROYW1lICsgXCItZGF0YS1tZWRpYVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVyc2lzdGVudDogcGVyc2lzdGVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG93bmVyOiBcInNjZW5lXCIsIC8vIHNvIHRoYXQgb3VyIGluaXRpYWwgdmFsdWUgZG9lc24ndCBvdmVyd3JpdGUgb3RoZXJzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXR3b3JrSWQ6IG5ldElkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYXBwZW5kQ2hpbGQoZW50aXR5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzYXZlIGEgcG9pbnRlciB0byB0aGUgbmV0d29ya2VkIGVudGl0eSBhbmQgdGhlbiB3YWl0IGZvciBpdCB0byBiZSBmdWxseVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluaXRpYWxpemVkIGJlZm9yZSBnZXR0aW5nIGEgcG9pbnRlciB0byB0aGUgYWN0dWFsIG5ldHdvcmtlZCBjb21wb25lbnQgaW4gaXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm5ldEVudGl0eSA9IGVudGl0eTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBOQUYudXRpbHMuZ2V0TmV0d29ya2VkRW50aXR5KHRoaXMubmV0RW50aXR5KS50aGVuKG5ldHdvcmtlZEVsID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZVN5bmMgPSBuZXR3b3JrZWRFbC5jb21wb25lbnRzW2NvbXBvbmVudE5hbWUgKyBcIi1kYXRhXCJdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWRFbnRpdHkgPSB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5LmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBOQUYudXRpbHMuZ2V0TmV0d29ya2VkRW50aXR5KHRoaXMuZWwpLnRoZW4obmV0d29ya2VkRWwgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHVwTmV0d29ya2VkRW50aXR5KG5ldHdvcmtlZEVsKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZEVudGl0eSgpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBOZXR3b3JrZWQgPSB0aGlzLnNldHVwTmV0d29ya2VkLmJpbmQodGhpcylcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBtZXRob2QgaGFuZGxlcyB0aGUgZGlmZmVyZW50IHN0YXJ0dXAgY2FzZXM6XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAtIGlmIHRoZSBHTFRGIHdhcyBkcm9wcGVkIG9uIHRoZSBzY2VuZSwgTkFGIHdpbGwgYmUgY29ubmVjdGVkIGFuZCB3ZSBjYW4gXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGltbWVkaWF0ZWx5IGluaXRpYWxpemVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIC0gaWYgdGhlIEdMVEYgaXMgaW4gdGhlIHJvb20gc2NlbmUgb3IgcGlubmVkLCBpdCB3aWxsIGxpa2VseSBiZSBjcmVhdGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGJlZm9yZSBOQUYgaXMgc3RhcnRlZCBhbmQgY29ubmVjdGVkLCBzbyB3ZSB3YWl0IGZvciBhbiBldmVudCB0aGF0IGlzXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGZpcmVkIHdoZW4gSHVicyBoYXMgc3RhcnRlZCBOQUZcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChOQUYuY29ubmVjdGlvbiAmJiBOQUYuY29ubmVjdGlvbi5pc0Nvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR1cE5ldHdvcmtlZCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsLnNjZW5lRWwuYWRkRXZlbnRMaXN0ZW5lcignZGlkQ29ubmVjdFRvTmV0d29ya2VkU2NlbmUnLCB0aGlzLnNldHVwTmV0d29ya2VkKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGlmIGF0dGFjaGVkIHRvIGEgbm9kZSB3aXRoIGEgbWVkaWEtbG9hZGVyIGNvbXBvbmVudCwgdGhpcyBtZWFucyB3ZSBhdHRhY2hlZCB0aGlzIGNvbXBvbmVudFxuICAgICAgICAgICAgLy8gdG8gYSBtZWRpYSBvYmplY3QgaW4gU3Bva2UuICBXZSBzaG91bGQgd2FpdCB0aWxsIHRoZSBvYmplY3QgaXMgZnVsbHkgbG9hZGVkLiAgXG4gICAgICAgICAgICAvLyBPdGhlcndpc2UsIGl0IHdhcyBhdHRhY2hlZCB0byBzb21ldGhpbmcgaW5zaWRlIGEgR0xURiAocHJvYmFibHkgaW4gYmxlbmRlcilcbiAgICAgICAgICAgIGlmICh0aGlzLmVsLmNvbXBvbmVudHNbXCJtZWRpYS1sb2FkZXJcIl0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtZWRpYS1sb2FkZWRcIiwgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBsb2FkZXIoKVxuICAgICAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAgICAgb25jZTogdHJ1ZVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxvYWRlcigpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclNoYXJlZEFGUkFNRUNvbXBvbmVudHMoY29tcG9uZW50TmFtZSkge1xuICAgIC8vXG4gICAgLy8gQ29tcG9uZW50IGZvciBvdXIgbmV0d29ya2VkIHN0YXRlLiAgVGhpcyBjb21wb25lbnQgZG9lcyBub3RoaW5nIGV4Y2VwdCBhbGwgdXMgdG8gXG4gICAgLy8gY2hhbmdlIHRoZSBzdGF0ZSB3aGVuIGFwcHJvcHJpYXRlLiBXZSBjb3VsZCBzZXQgdGhpcyB1cCB0byBzaWduYWwgdGhlIGNvbXBvbmVudCBhYm92ZSB3aGVuXG4gICAgLy8gc29tZXRoaW5nIGhhcyBjaGFuZ2VkLCBpbnN0ZWFkIG9mIGhhdmluZyB0aGUgY29tcG9uZW50IGFib3ZlIHBvbGwgZWFjaCBmcmFtZS5cbiAgICAvL1xuXG4gICAgQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KGNvbXBvbmVudE5hbWUgKyAnLWRhdGEnLCB7XG4gICAgICAgIHNjaGVtYToge1xuICAgICAgICAgICAgc2FtcGxlZGF0YToge1xuICAgICAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogXCJ7fVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEgPSB0aGlzLnNldFNoYXJlZERhdGEuYmluZCh0aGlzKTtcblxuICAgICAgICAgICAgdGhpcy5kYXRhT2JqZWN0ID0gdGhpcy5lbC5nZXRTaGFyZWREYXRhKCk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzLmRhdGFPYmplY3QpKVxuICAgICAgICAgICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKGNvbXBvbmVudE5hbWUgKyBcIi1kYXRhXCIsIFwic2FtcGxlZGF0YVwiLCB0aGlzLnNoYXJlZERhdGEpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJDb3VsZG4ndCBlbmNvZGUgaW5pdGlhbCBkYXRhIG9iamVjdDogXCIsIGUsIHRoaXMuZGF0YU9iamVjdClcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSBcInt9XCJcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jaGFuZ2VkID0gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgdXBkYXRlKCkge1xuICAgICAgICAgICAgdGhpcy5jaGFuZ2VkID0gISh0aGlzLnNoYXJlZERhdGEgPT09IHRoaXMuZGF0YS5zYW1wbGVkYXRhKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBKU09OLnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudCh0aGlzLmRhdGEuc2FtcGxlZGF0YSkpXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gZG8gdGhlc2UgYWZ0ZXIgdGhlIEpTT04gcGFyc2UgdG8gbWFrZSBzdXJlIGl0IGhhcyBzdWNjZWVkZWRcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhID0gdGhpcy5kYXRhLnNhbXBsZWRhdGE7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlZCA9IHRydWVcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJjb3VsZG4ndCBwYXJzZSBKU09OIHJlY2VpdmVkIGluIGRhdGEtc3luYzogXCIsIGUpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IFwie31cIlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSB7fVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvLyBpdCBpcyBsaWtlbHkgdGhhdCBhcHBseVBlcnNpc3RlbnRTeW5jIG9ubHkgbmVlZHMgdG8gYmUgY2FsbGVkIGZvciBwZXJzaXN0ZW50XG4gICAgICAgIC8vIG5ldHdvcmtlZCBlbnRpdGllcywgc28gd2UgX3Byb2JhYmx5XyBkb24ndCBuZWVkIHRvIGRvIHRoaXMuICBCdXQgaWYgdGhlcmUgaXMgbm9cbiAgICAgICAgLy8gcGVyc2lzdGVudCBkYXRhIHNhdmVkIGZyb20gdGhlIG5ldHdvcmsgZm9yIHRoaXMgZW50aXR5LCB0aGlzIGNvbW1hbmQgZG9lcyBub3RoaW5nLlxuICAgICAgICBwbGF5KCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBub3Qgc3VyZSBpZiB0aGlzIGlzIHJlYWxseSBuZWVkZWQsIGJ1dCBjYW4ndCBodXJ0XG4gICAgICAgICAgICAgICAgaWYgKEFQUC51dGlscykgeyAvLyB0ZW1wb3JhcnkgdGlsbCB3ZSBzaGlwIG5ldyBjbGllbnRcbiAgICAgICAgICAgICAgICAgICAgQVBQLnV0aWxzLmFwcGx5UGVyc2lzdGVudFN5bmModGhpcy5lbC5jb21wb25lbnRzLm5ldHdvcmtlZC5kYXRhLm5ldHdvcmtJZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHNldFNoYXJlZERhdGEoZGF0YU9iamVjdCkge1xuICAgICAgICAgICAgaWYgKCFOQUYudXRpbHMuaXNNaW5lKHRoaXMuZWwpICYmICFOQUYudXRpbHMudGFrZU93bmVyc2hpcCh0aGlzLmVsKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHZhciBkYXRhU3RyaW5nID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KGRhdGFPYmplY3QpKVxuICAgICAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YSA9IGRhdGFTdHJpbmdcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGFPYmplY3QgPSBkYXRhT2JqZWN0XG4gICAgICAgICAgICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoY29tcG9uZW50TmFtZSArIFwiLWRhdGFcIiwgXCJzYW1wbGVkYXRhXCIsIGRhdGFTdHJpbmcpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImNhbid0IHN0cmluZ2lmeSB0aGUgb2JqZWN0IHBhc3NlZCB0byBkYXRhLXN5bmNcIilcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIG91ciB0ZW1wbGF0ZSBmb3Igb3VyIG5ldHdvcmtlZCBvYmplY3QgdG8gdGhlIGEtZnJhbWUgYXNzZXRzIG9iamVjdCxcbiAgICAvLyBhbmQgYSBzY2hlbWEgdG8gdGhlIE5BRi5zY2hlbWFzLiAgQm90aCBtdXN0IGJlIHRoZXJlIHRvIGhhdmUgY3VzdG9tIGNvbXBvbmVudHMgd29ya1xuXG4gICAgY29uc3QgYXNzZXRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcImEtYXNzZXRzXCIpO1xuXG4gICAgYXNzZXRzLmluc2VydEFkamFjZW50SFRNTChcbiAgICAgICAgJ2JlZm9yZWVuZCcsXG4gICAgICAgIGBcbjx0ZW1wbGF0ZSBpZD1cImAgKyBjb21wb25lbnROYW1lICsgYC1kYXRhLW1lZGlhXCI+XG4gIDxhLWVudGl0eVxuICAgIGAgKyBjb21wb25lbnROYW1lICsgYC1kYXRhXG4gID48L2EtZW50aXR5PlxuPC90ZW1wbGF0ZT5cbmBcbiAgICApXG5cbiAgICBOQUYuc2NoZW1hcy5hZGQoe1xuICAgICAgICB0ZW1wbGF0ZTogXCIjXCIgKyBjb21wb25lbnROYW1lICsgXCItZGF0YS1tZWRpYVwiLFxuICAgICAgICBjb21wb25lbnRzOiBbe1xuICAgICAgICAgICAgY29tcG9uZW50OiBjb21wb25lbnROYW1lICsgXCItZGF0YVwiLFxuICAgICAgICAgICAgcHJvcGVydHk6IFwic2FtcGxlZGF0YVwiXG4gICAgICAgIH1dLFxuICAgICAgICBub25BdXRob3JpemVkQ29tcG9uZW50czogW3tcbiAgICAgICAgICAgIGNvbXBvbmVudDogY29tcG9uZW50TmFtZSArIFwiLWRhdGFcIixcbiAgICAgICAgICAgIHByb3BlcnR5OiBcInNhbXBsZWRhdGFcIlxuICAgICAgICB9XSxcblxuICAgIH0pO1xufSIsIi8qKlxuICogRGVzY3JpcHRpb25cbiAqID09PT09PT09PT09XG4gKiBjcmVhdGUgYSB0aHJlZWpzIG9iamVjdCAodHdvIGN1YmVzLCBvbmUgb24gdGhlIHN1cmZhY2Ugb2YgdGhlIG90aGVyKSB0aGF0IGNhbiBiZSBpbnRlcmFjdGVkIFxuICogd2l0aCBhbmQgaGFzIHNvbWUgbmV0d29ya2VkIGF0dHJpYnV0ZXMuXG4gKlxuICovXG5pbXBvcnQge1xuICAgIGludGVyYWN0aXZlQ29tcG9uZW50VGVtcGxhdGUsXG4gICAgcmVnaXN0ZXJTaGFyZWRBRlJBTUVDb21wb25lbnRzXG59IGZyb20gXCIuLi91dGlscy9pbnRlcmFjdGlvblwiO1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBzaW1wbGUgY29udmVuaWVuY2UgZnVuY3Rpb25zIFxuZnVuY3Rpb24gcmFuZG9tQ29sb3IoKSB7XG4gICAgcmV0dXJuIG5ldyBUSFJFRS5Db2xvcihNYXRoLnJhbmRvbSgpLCBNYXRoLnJhbmRvbSgpLCBNYXRoLnJhbmRvbSgpKTtcbn1cblxuZnVuY3Rpb24gYWxtb3N0RXF1YWxWZWMzKHUsIHYsIGVwc2lsb24pIHtcbiAgICByZXR1cm4gTWF0aC5hYnModS54IC0gdi54KSA8IGVwc2lsb24gJiYgTWF0aC5hYnModS55IC0gdi55KSA8IGVwc2lsb24gJiYgTWF0aC5hYnModS56IC0gdi56KSA8IGVwc2lsb247XG59O1xuXG5mdW5jdGlvbiBhbG1vc3RFcXVhbENvbG9yKHUsIHYsIGVwc2lsb24pIHtcbiAgICByZXR1cm4gTWF0aC5hYnModS5yIC0gdi5yKSA8IGVwc2lsb24gJiYgTWF0aC5hYnModS5nIC0gdi5nKSA8IGVwc2lsb24gJiYgTWF0aC5hYnModS5iIC0gdi5iKSA8IGVwc2lsb247XG59O1xuXG4vLyBhIGxvdCBvZiB0aGUgY29tcGxleGl0eSBoYXMgYmVlbiBwdWxsZWQgb3V0IGludG8gbWV0aG9kcyBpbiB0aGUgb2JqZWN0XG4vLyBjcmVhdGVkIGJ5IGludGVyYWN0aXZlQ29tcG9uZW50VGVtcGxhdGUoKSBhbmQgcmVnaXN0ZXJTaGFyZWRBRlJBTUVjb21wb25lbnRzKCkuXG4vLyBIZXJlLCB3ZSBkZWZpbmUgbWV0aG9kcyB0aGF0IGFyZSB1c2VkIGJ5IHRoZSBvYmplY3QgdGhlcmUsIHRvIGRvIG91ciBvYmplY3Qtc3BlY2lmaWNcbi8vIHdvcmsuXG5cbi8vIFdlIG5lZWQgdG8gZGVmaW5lOlxuLy8gLSBBRlJBTUUgXG4vLyAgIC0gc2NoZW1hXG4vLyAgIC0gaW5pdCgpIG1ldGhvZCwgd2hpY2ggc2hvdWxkIGNhbiBzdGFydEluaXQoKSBhbmQgZmluaXNoSW5pdCgpXG4vLyAgIC0gdXBkYXRlKCkgYW5kIHBsYXkoKSBpZiB5b3UgbmVlZCB0aGVtXG4vLyAgIC0gdGljaygpIGFuZCB0aWNrMigpIHRvIGhhbmRsZSBmcmFtZSB1cGRhdGVzXG4vL1xuLy8gLSBjaGFuZ2UgaXNOZXR3b3JrZWQsIGlzSW50ZXJhY3RpdmUsIGlzRHJhZ2dhYmxlIChkZWZhdWx0OiBmYWxzZSkgdG8gcmVmbGVjdCB3aGF0IFxuLy8gICB0aGUgb2JqZWN0IG5lZWRzIHRvIGRvLlxuLy8gLSBsb2FkRGF0YSgpIGlzIGFuIGFzeW5jIGZ1bmN0aW9uIHRoYXQgZG9lcyBhbnkgc2xvdyB3b3JrIChsb2FkaW5nIHRoaW5ncywgZXRjKVxuLy8gICBhbmQgaXMgY2FsbGVkIGJ5IGZpbmlzaEluaXQoKSwgd2hpY2ggd2FpdHMgdGlsbCBpdCdzIGRvbmUgYmVmb3JlIHNldHRpbmcgdGhpbmdzIHVwXG4vLyAtIGluaXRpYWxpemVEYXRhKCkgaXMgY2FsbGVkIHRvIHNldCB1cCB0aGUgaW5pdGlhbCBzdGF0ZSBvZiB0aGUgb2JqZWN0LCBhIGdvb2QgXG4vLyAgIHBsYWNlIHRvIGNyZWF0ZSB0aGUgM0QgY29udGVudC4gIFRoZSB0aHJlZS5qcyBzY2VuZSBzaG91bGQgYmUgYWRkZWQgdG8gXG4vLyAgIHRoaXMuc2ltcGxlQ29udGFpbnRlclxuLy8gLSBjbGlja2VkKCkgaXMgY2FsbGVkIHdoZW4gdGhlIG9iamVjdCBpcyBjbGlja2VkXG4vLyAtIGRyYWdTdGFydCgpIGlzIGNhbGxlZCByaWdodCBhZnRlciBjbGlja2VkKCkgaWYgaXNEcmFnZ2FibGUgaXMgdHJ1ZSwgdG8gc2V0IHVwXG4vLyAgIGZvciBhIHBvc3NpYmxlIGRyYWcgb3BlcmF0aW9uXG4vLyAtIGRyYWdFbmQoKSBpcyBjYWxsZWQgd2hlbiB0aGUgbW91c2UgaXMgcmVsZWFzZWRcbi8vIC0gZHJhZygpIHNob3VsZCBiZSBjYWxsZWQgZWFjaCBmcmFtZSB3aGlsZSB0aGUgb2JqZWN0IGlzIGJlaW5nIGRyYWdnZWQgKGJldHdlZW4gXG4vLyAgIGRyYWdTdGFydCgpIGFuZCBkcmFnRW5kKCkpXG4vLyAtIGdldEludGVyYWN0b3JzKCkgcmV0dXJucyBhbiBhcnJheSBvZiBvYmplY3RzIGZvciB3aGljaCBpbnRlcmFjdGlvbiBjb250cm9scyBhcmVcbi8vICAgaW50ZXJzZWN0aW5nIHRoZSBvYmplY3QuIFRoZXJlIHdpbGwgbGlrZWx5IGJlIHplcm8sIG9uZSwgb3IgdHdvIG9mIHRoZXNlIChpZiBcbi8vICAgdGhlcmUgYXJlIHR3byBjb250cm9sbGVycyBhbmQgYm90aCBhcmUgcG9pbnRpbmcgYXQgdGhlIG9iamVjdCkuICBUaGUgXCJjdXJzb3JcIlxuLy8gICBmaWVsZCBpcyBhIHBvaW50ZXIgdG8gdGhlIHNtYWxsIHNwaGVyZSBPYmplY3QzRCB0aGF0IGlzIGRpc3BsYXllZCB3aGVyZSB0aGUgXG4vLyAgIGludGVyYWN0aW9uIHJheSB0b3VjaGVzIHRoZSBvYmplY3QuIFRoZSBcImNvbnRyb2xsZXJcIiBmaWVsZCBpcyB0aGUgXG4vLy8gIGNvcnJlc3BvbmRpbmcgY29udHJvbGxlclxuLy8gICBvYmplY3QgdGhhdCBpbmNsdWRlcyB0aGluZ3MgbGlrZSB0aGUgcmF5Q2FzdGVyLlxuLy8gLSBnZXRJbnRlcnNlY3Rpb24oKSB0YWtlcyBpbiB0aGUgaW50ZXJhY3RvciBhbmQgdGhlIHRocmVlLmpzIG9iamVjdDNEIGFycmF5IFxuLy8gICB0aGF0IHNob3VsZCBiZSB0ZXN0ZWQgZm9yIGludGVyYWN0aW9uLlxuXG4vLyBOb3RlIHRoYXQgb25seSB0aGUgZW50aXR5IHRoYXQgdGhpcyBjb21wb25lbnQgaXMgYXR0YWNoZWQgdG8gd2lsbCBiZSBcInNlZW5cIlxuLy8gYnkgSHVicyBpbnRlcmFjdGlvbiBzeXN0ZW0sIHNvIHRoZSBlbnRpcmUgdGhyZWUuanMgdHJlZSBiZWxvdyBpdCB0cmlnZ2Vyc1xuLy8gY2xpY2sgYW5kIGRyYWcgZXZlbnRzLiAgVGhlIGdldEludGVyc2VjdGlvbigpIG1ldGhvZCBpcyBuZWVkZWQgXG5cbi8vIHRoZSBjb21wb25lbnROYW1lIG11c3QgYmUgbG93ZXJjYXNlLCBjYW4gaGF2ZSBoeXBoZW5zLCBzdGFydCB3aXRoIGEgbGV0dGVyLCBcbi8vIGJ1dCBubyB1bmRlcnNjb3Jlc1xubGV0IGNvbXBvbmVudE5hbWUgPSBcInRlc3QtY3ViZVwiO1xuXG4vLyBnZXQgdGhlIHRlbXBsYXRlIHBhcnQgb2YgdGhlIG9iamVjdCBuZWVkIGZvciB0aGUgQUZSQU1FIGNvbXBvbmVudFxubGV0IHRlbXBsYXRlID0gaW50ZXJhY3RpdmVDb21wb25lbnRUZW1wbGF0ZShjb21wb25lbnROYW1lKTtcblxuLy8gY3JlYXRlIHRoZSBhZGRpdGlvbmFsIHBhcnRzIG9mIHRoZSBvYmplY3QgbmVlZGVkIGZvciB0aGUgQUZSQU1FIGNvbXBvbmVudFxubGV0IGNoaWxkID0ge1xuICAgIHNjaGVtYToge1xuICAgICAgICAvLyBuYW1lIGlzIGhvcGVmdWxseSB1bmlxdWUgZm9yIGVhY2ggaW5zdGFuY2VcbiAgICAgICAgbmFtZToge1xuICAgICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIGRlZmF1bHQ6IFwiXCJcbiAgICAgICAgfSxcblxuICAgICAgICAvLyB0aGUgdGVtcGxhdGUgd2lsbCBsb29rIGZvciB0aGVzZSBwcm9wZXJ0aWVzLiBJZiB0aGV5IGFyZW4ndCB0aGVyZSwgdGhlblxuICAgICAgICAvLyB0aGUgbG9va3VwICh0aGlzLmRhdGEuKikgd2lsbCBldmFsdWF0ZSB0byBmYWxzZXlcbiAgICAgICAgaXNOZXR3b3JrZWQ6IHtcbiAgICAgICAgICAgIHR5cGU6IFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgZGVmYXVsdDogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgaXNJbnRlcmFjdGl2ZToge1xuICAgICAgICAgICAgdHlwZTogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBkZWZhdWx0OiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIGlzRHJhZ2dhYmxlOiB7XG4gICAgICAgICAgICB0eXBlOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIGRlZmF1bHQ6IHRydWVcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBvdXIgZGF0YVxuICAgICAgICB3aWR0aDoge1xuICAgICAgICAgICAgdHlwZTogXCJudW1iZXJcIixcbiAgICAgICAgICAgIGRlZmF1bHQ6IDFcbiAgICAgICAgfSxcbiAgICAgICAgY29sb3I6IHtcbiAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBkZWZhdWx0OiBcIlwiXG4gICAgICAgIH0sXG4gICAgICAgIHBhcmFtZXRlcjE6IHtcbiAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBkZWZhdWx0OiBcIlwiXG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gZnVsbE5hbWUgaXMgdXNlZCB0byBnZW5lcmF0ZSBuYW1lcyBmb3IgdGhlIEFGUmFtZSBvYmplY3RzIHdlIGNyZWF0ZS4gIFNob3VsZCBiZVxuICAgIC8vIHVuaXF1ZSBmb3IgZWFjaCBpbnN0YW5jZSBvZiBhbiBvYmplY3QsIHdoaWNoIHdlIHNwZWNpZnkgd2l0aCBuYW1lLiAgSWYgbmFtZSBkb2VzXG4gICAgLy8gbmFtZSBnZXQgdXNlZCBhcyBhIHNjaGVtZSBwYXJhbWV0ZXIsIGl0IGRlZmF1bHRzIHRvIHRoZSBuYW1lIG9mIGl0J3MgcGFyZW50IGdsVEZcbiAgICAvLyBvYmplY3QsIHdoaWNoIG9ubHkgd29ya3MgaWYgdGhvc2UgYXJlIHVuaXF1ZWx5IG5hbWVkLlxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5zdGFydEluaXQoKTtcblxuICAgICAgICAvLyB0aGUgdGVtcGxhdGUgdXNlcyB0aGVzZSB0byBzZXQgdGhpbmdzIHVwLiAgcmVsYXRpdmVTaXplXG4gICAgICAgIC8vIGlzIHVzZWQgdG8gc2V0IHRoZSBzaXplIG9mIHRoZSBvYmplY3QgcmVsYXRpdmUgdG8gdGhlIHNpemUgb2YgdGhlIGltYWdlXG4gICAgICAgIC8vIHRoYXQgaXQncyBhdHRhY2hlZCB0bzogYSBzaXplIG9mIDEgbWVhbnMgXG4gICAgICAgIC8vICAgXCJ0aGUgc2l6ZSBvZiAxeDF4MSB1bml0cyBpbiB0aGUgb2JqZWN0XG4gICAgICAgIC8vICAgIHNwYWNlIHdpbGwgYmUgdGhlIHNhbWUgYXMgdGhlIHNpemUgb2YgdGhlIGltYWdlXCIuICBcbiAgICAgICAgLy8gTGFyZ2VyIHJlbGF0aXZlIHNpemVzIHdpbGwgbWFrZSB0aGUgb2JqZWN0IHNtYWxsZXIgYmVjYXVzZSB3ZSBhcmVcbiAgICAgICAgLy8gc2F5aW5nIHRoYXQgYSBzaXplIG9mIE54TnhOIG1hcHMgdG8gdGhlIFNpemUgb2YgdGhlIGltYWdlLCBhbmQgdmljZSB2ZXJzYS4gIFxuICAgICAgICAvLyBGb3IgZXhhbXBsZSwgaWYgdGhlIG9iamVjdCBiZWxvdyBpcyAyLDIgaW4gc2l6ZSBhbmQgd2Ugc2V0IHNpemUgMiwgdGhlblxuICAgICAgICAvLyB0aGUgb2JqZWN0IHdpbGwgcmVtYWluIHRoZSBzYW1lIHNpemUgYXMgdGhlIGltYWdlLiBJZiB3ZSBsZWF2ZSBpdCBhdCAxLDEsXG4gICAgICAgIC8vIHRoZW4gdGhlIG9iamVjdCB3aWxsIGJlIHR3aWNlIHRoZSBzaXplIG9mIHRoZSBpbWFnZS4gXG4gICAgICAgIHRoaXMucmVsYXRpdmVTaXplID0gdGhpcy5kYXRhLndpZHRoO1xuXG4gICAgICAgIC8vIG92ZXJyaWRlIHRoZSBkZWZhdWx0cyBpbiB0aGUgdGVtcGxhdGVcbiAgICAgICAgdGhpcy5pc0RyYWdnYWJsZSA9IHRoaXMuZGF0YS5pc0RyYWdnYWJsZTtcbiAgICAgICAgdGhpcy5pc0ludGVyYWN0aXZlID0gdGhpcy5kYXRhLmlzSW50ZXJhY3RpdmU7XG4gICAgICAgIHRoaXMuaXNOZXR3b3JrZWQgPSB0aGlzLmRhdGEuaXNOZXR3b3JrZWQ7XG5cbiAgICAgICAgLy8gb3VyIHBvdGVudGlhbGwtc2hhcmVkIG9iamVjdCBzdGF0ZSAodHdvIHJvYXRpb25zIGFuZCB0d28gY29sb3JzIGZvciB0aGUgYm94ZXMpIFxuICAgICAgICB0aGlzLnNoYXJlZERhdGEgPSB7XG4gICAgICAgICAgICBjb2xvcjogbmV3IFRIUkVFLkNvbG9yKHRoaXMuZGF0YS5jb2xvci5sZW5ndGggPiAwID8gdGhpcy5kYXRhLmNvbG9yIDogXCJncmV5XCIpLFxuICAgICAgICAgICAgcm90YXRpb246IG5ldyBUSFJFRS5FdWxlcigpLFxuICAgICAgICAgICAgcG9zaXRpb246IG5ldyBUSFJFRS5WZWN0b3IzKDAsMC41LDApXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gc29tZSBsb2NhbCBzdGF0ZVxuICAgICAgICB0aGlzLmluaXRpYWxFdWxlciA9IG5ldyBUSFJFRS5FdWxlcigpXG5cbiAgICAgICAgLy8gc29tZSBjbGljay9kcmFnIHN0YXRlXG4gICAgICAgIHRoaXMuY2xpY2tFdmVudCA9IG51bGxcbiAgICAgICAgdGhpcy5jbGlja0ludGVyc2VjdGlvbiA9IG51bGxcblxuICAgICAgICAvLyB3ZSBzaG91bGQgc2V0IGZ1bGxOYW1lIGlmIHdlIGhhdmUgYSBtZWFuaW5nZnVsIG5hbWVcbiAgICAgICAgaWYgKHRoaXMuZGF0YS5uYW1lICYmIHRoaXMuZGF0YS5uYW1lLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuZnVsbE5hbWUgPSB0aGlzLmRhdGEubmFtZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGZpbmlzaCB0aGUgaW5pdGlhbGl6YXRpb25cbiAgICAgICAgdGhpcy5maW5pc2hJbml0KCk7XG4gICAgfSxcblxuICAgIC8vIGlmIGFueXRoaW5nIGNoYW5nZWQgaW4gdGhpcy5kYXRhLCB3ZSBuZWVkIHRvIHVwZGF0ZSB0aGUgb2JqZWN0LiAgXG4gICAgLy8gdGhpcyBpcyBwcm9iYWJseSBub3QgZ29pbmcgdG8gaGFwcGVuLCBidXQgY291bGQgaWYgYW5vdGhlciBvZiBcbiAgICAvLyBvdXIgc2NyaXB0cyBtb2RpZmllcyB0aGUgY29tcG9uZW50IHByb3BlcnRpZXMgaW4gdGhlIERPTVxuICAgIHVwZGF0ZTogZnVuY3Rpb24gKCkge30sXG5cbiAgICAvLyBkbyBzb21lIHN0dWZmIHRvIGdldCBhc3luYyBkYXRhLiAgQ2FsbGVkIGJ5IGluaXRUZW1wbGF0ZSgpXG4gICAgbG9hZERhdGE6IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgfSxcblxuICAgIC8vIGNhbGxlZCBieSBpbml0VGVtcGxhdGUoKSB3aGVuIHRoZSBjb21wb25lbnQgaXMgYmVpbmcgcHJvY2Vzc2VkLiAgSGVyZSwgd2UgY3JlYXRlXG4gICAgLy8gdGhlIHRocmVlLmpzIG9iamVjdHMgd2Ugd2FudCwgYW5kIGFkZCB0aGVtIHRvIHNpbXBsZUNvbnRhaW5lciAoYW4gQUZyYW1lIG5vZGUgXG4gICAgLy8gdGhlIHRlbXBsYXRlIGNyZWF0ZWQgZm9yIHVzKS5cbiAgICBpbml0aWFsaXplRGF0YTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmJveCA9IG5ldyBUSFJFRS5NZXNoKFxuICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KDEsIDEsIDEsIDIsIDIsIDIpLFxuICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcbiAgICAgICAgICAgICAgICBjb2xvcjogdGhpcy5zaGFyZWREYXRhLmNvbG9yXG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgICB0aGlzLmJveC5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIuc2V0T2JqZWN0M0QoJ2JveCcsIHRoaXMuYm94KVxuXG4gICAgICAgIC8vIGNyZWF0ZSBhIHNlY29uZCBzbWFsbCwgYmxhY2sgYm94IG9uIHRoZSBzdXJmYWNlIG9mIHRoZSBib3hcbiAgICAgICAgdGhpcy5ib3gyID0gbmV3IFRIUkVFLk1lc2goXG4gICAgICAgICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMC4xLCAwLjEsIDAuMSwgMiwgMiwgMiksXG4gICAgICAgICAgICBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICAgICAgICAgIGNvbG9yOiBcImJsYWNrXCJcbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuYm94Mi5tYXRyaXhBdXRvVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5ib3gyLnBvc2l0aW9uLmNvcHkodGhpcy5zaGFyZWREYXRhLnBvc2l0aW9uKVxuXG4gICAgICAgIC8vIGFkZCBpdCBhcyBhIGNoaWxkIG9mIHRoZSBmaXJzdCBib3gsIHNpbmNlIHdlIHdhbnQgaXQgdG8gbW92ZSB3aXRoIHRoZSBmaXJzdCBib3hcbiAgICAgICAgdGhpcy5ib3guYWRkKHRoaXMuYm94MilcblxuICAgICAgICAvLyBJTVBPUlRBTlQ6IGFueSB0aHJlZS5qcyBvYmplY3QgdGhhdCBpcyBhZGRlZCB0byBhIEh1YnMgKGFmcmFtZSkgZW50aXR5IFxuICAgICAgICAvLyBtdXN0IGhhdmUgXCIuZWxcIiBwb2ludGluZyB0byB0aGUgQUZSQU1FIEVudGl0eSB0aGF0IGNvbnRhaW5zIGl0LlxuICAgICAgICAvLyBXaGVuIGFuIG9iamVjdDNEIGlzIGFkZGVkIHdpdGggXCIuc2V0T2JqZWN0M0RcIiwgaXQgaXMgYWRkZWQgdG8gdGhlIFxuICAgICAgICAvLyBvYmplY3QzRCBmb3IgdGhhdCBFbnRpdHksIGFuZCBzZXRzIGFsbCBvZiB0aGUgY2hpbGRyZW4gb2YgdGhhdFxuICAgICAgICAvLyBvYmplY3QzRCB0byBwb2ludCB0byB0aGUgc2FtZSBFbnRpdHkuICBJZiB5b3UgYWRkIGFuIG9iamVjdDNEIHRvXG4gICAgICAgIC8vIHRoZSBzdWItdHJlZSBvZiB0aGF0IG9iamVjdCBsYXRlciwgeW91IG11c3QgZG8gdGhpcyB5b3Vyc2VsZi4gXG4gICAgICAgIHRoaXMuYm94Mi5lbCA9IHRoaXMuc2ltcGxlQ29udGFpbmVyXG5cbiAgICAgICAgLy8gdGVsbCB0aGUgcG9ydGFscyB0byB1cGRhdGUgdGhlaXIgdmlld1xuICAgICAgICB0aGlzLmVsLnNjZW5lRWwuZW1pdCgndXBkYXRlUG9ydGFscycpIFxuXG4gICAgfSxcblxuICAgIC8vIGNhbGxlZCBmcm9tIHJlbW92ZSgpIGluIHRoZSB0ZW1wbGF0ZSB0byByZW1vdmUgYW55IGxvY2FsIHJlc291cmNlcyB3aGVuIHRoZSBjb21wb25lbnRcbiAgICAvLyBpcyBkZXN0cm95ZWRcbiAgICByZW1vdmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5zaW1wbGVDb250YWluZXIucmVtb3ZlT2JqZWN0M0QoXCJib3hcIilcbiAgICAgICAgdGhpcy5ib3guZ2VvbWV0cnkuZGlzcG9zZSgpXG4gICAgICAgIHRoaXMuYm94Lm1hdGVyaWFsLmRpc3Bvc2UoKVxuICAgICAgICB0aGlzLmJveDIuZ2VvbWV0cnkuZGlzcG9zZSgpXG4gICAgICAgIHRoaXMuYm94Mi5tYXRlcmlhbC5kaXNwb3NlKClcbiAgICAgICAgdGhpcy5yZW1vdmVUZW1wbGF0ZSgpXG4gICAgfSxcblxuICAgIC8vIGhhbmRsZSBcImludGVyYWN0XCIgZXZlbnRzIGZvciBjbGlja2FibGUgZW50aXRpZXNcbiAgICBjbGlja2VkOiBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgIC8vIHRoZSBldnQudGFyZ2V0IHdpbGwgcG9pbnQgYXQgdGhlIG9iamVjdDNEIGluIHRoaXMgZW50aXR5LiAgV2UgY2FuIHVzZVxuICAgICAgICAvLyBoYW5kbGVJbnRlcmFjdGlvbi5nZXRJbnRlcmFjdGlvblRhcmdldCgpIHRvIGdldCB0aGUgbW9yZSBwcmVjaXNlIFxuICAgICAgICAvLyBoaXQgaW5mb3JtYXRpb24gYWJvdXQgd2hpY2ggb2JqZWN0M0RzIGluIG91ciBvYmplY3Qgd2VyZSBoaXQuICBXZSBzdG9yZVxuICAgICAgICAvLyB0aGUgb25lIHRoYXQgd2FzIGNsaWNrZWQgaGVyZSwgc28gd2Uga25vdyB3aGljaCBpdCB3YXMgYXMgd2UgZHJhZyBhcm91bmRcbiAgICAgICAgdGhpcy5jbGlja0ludGVyc2VjdGlvbiA9IHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZ2V0SW50ZXJzZWN0aW9uKGV2dC5vYmplY3QzRCwgW2V2dC50YXJnZXRdKTtcbiAgICAgICAgdGhpcy5jbGlja0V2ZW50ID0gZXZ0O1xuXG4gICAgICAgIGlmICghdGhpcy5jbGlja0ludGVyc2VjdGlvbikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiY2xpY2sgZGlkbid0IGhpdCBhbnl0aGluZzsgc2hvdWxkbid0IGhhcHBlblwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveCkge1xuICAgICAgICAgICAgLy8gbmV3IHJhbmRvbSBjb2xvciBvbiBlYWNoIGNsaWNrXG4gICAgICAgICAgICBsZXQgbmV3Q29sb3IgPSByYW5kb21Db2xvcigpXG5cbiAgICAgICAgICAgIHRoaXMuYm94Lm1hdGVyaWFsLmNvbG9yLnNldChuZXdDb2xvcilcbiAgICAgICAgICAgIHRoaXMuc2hhcmVkRGF0YS5jb2xvci5zZXQobmV3Q29sb3IpXG4gICAgICAgICAgICB0aGlzLnNldFNoYXJlZERhdGEoKVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24ub2JqZWN0ID09IHRoaXMuYm94Mikge31cbiAgICB9LFxuXG4gICAgLy8gY2FsbGVkIHRvIHN0YXJ0IHRoZSBkcmFnLiAgV2lsbCBiZSBjYWxsZWQgYWZ0ZXIgY2xpY2tlZCgpIGlmIGlzRHJhZ2dhYmxlIGlzIHRydWVcbiAgICBkcmFnU3RhcnQ6IGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgLy8gc2V0IHVwIHRoZSBkcmFnIHN0YXRlXG4gICAgICAgIGlmICghdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5zdGFydERyYWcoZXZ0LCB0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCkpIHtcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gZ3JhYiBhIGNvcHkgb2YgdGhlIGN1cnJlbnQgb3JpZW50YXRpb24gb2YgdGhlIG9iamVjdCB3ZSBjbGlja2VkXG4gICAgICAgIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveCkge1xuICAgICAgICAgICAgdGhpcy5pbml0aWFsRXVsZXIuY29weSh0aGlzLmJveC5yb3RhdGlvbilcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveDIpIHtcbiAgICAgICAgICAgIHRoaXMuYm94Mi5tYXRlcmlhbC5jb2xvci5zZXQoXCJyZWRcIilcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBjYWxsZWQgd2hlbiB0aGUgYnV0dG9uIGlzIHJlbGVhc2VkIHRvIGZpbmlzaCB0aGUgZHJhZ1xuICAgIGRyYWdFbmQ6IGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5lbmREcmFnKGV2dClcbiAgICAgICAgaWYgKHRoaXMuY2xpY2tJbnRlcnNlY3Rpb24ub2JqZWN0ID09IHRoaXMuYm94KSB7fSBlbHNlIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveDIpIHtcbiAgICAgICAgICAgIHRoaXMuYm94Mi5tYXRlcmlhbC5jb2xvci5zZXQoXCJibGFja1wiKVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vIHRoZSBtZXRob2Qgc2V0U2hhcmVkRGF0YSgpIGFsd2F5cyBzZXRzIHRoZSBzaGFyZWQgZGF0YSwgY2F1c2luZyBhIG5ldHdvcmsgdXBkYXRlLiAgXG4gICAgLy8gV2UgY2FuIGJlIHNtYXJ0ZXIgaGVyZSBieSBjYWxsaW5nIGl0IG9ubHkgd2hlbiBzaWduaWZpY2FudCBjaGFuZ2VzIGhhcHBlbiwgXG4gICAgLy8gd2hpY2ggd2UnbGwgZG8gaW4gdGhlIHNldFNoYXJlZEV1bGVyIG1ldGhvZHNcbiAgICBzZXRTaGFyZWRFdWxlcjogZnVuY3Rpb24gKG5ld0V1bGVyKSB7XG4gICAgICAgIGlmICghYWxtb3N0RXF1YWxWZWMzKHRoaXMuc2hhcmVkRGF0YS5yb3RhdGlvbiwgbmV3RXVsZXIsIDAuMDUpKSB7XG4gICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEucm90YXRpb24uY29weShuZXdFdWxlcilcbiAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRGF0YSgpXG4gICAgICAgIH1cbiAgICB9LFxuICAgIHNldFNoYXJlZFBvc2l0aW9uOiBmdW5jdGlvbiAobmV3UG9zKSB7XG4gICAgICAgIGlmICghYWxtb3N0RXF1YWxWZWMzKHRoaXMuc2hhcmVkRGF0YS5wb3NpdGlvbiwgbmV3UG9zLCAwLjA1KSkge1xuICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhLnBvc2l0aW9uLmNvcHkobmV3UG9zKVxuICAgICAgICAgICAgdGhpcy5zZXRTaGFyZWREYXRhKClcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvLyBpZiB0aGUgb2JqZWN0IGlzIG5ldHdvcmtlZCwgdGhpcy5zdGF0ZVN5bmMgd2lsbCBleGlzdCBhbmQgc2hvdWxkIGJlIGNhbGxlZFxuICAgIHNldFNoYXJlZERhdGE6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuc3RhdGVTeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZVN5bmMuc2V0U2hhcmVkRGF0YSh0aGlzLnNoYXJlZERhdGEpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9LFxuXG4gICAgLy8gdGhpcyBpcyBjYWxsZWQgZnJvbSB0aGUgbmV0d29ya2VkIGRhdGEgZW50aXR5IHRvIGdldCB0aGUgaW5pdGlhbCBkYXRhIFxuICAgIC8vIGZyb20gdGhlIGNvbXBvbmVudFxuICAgIGdldFNoYXJlZERhdGE6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2hhcmVkRGF0YVxuICAgIH0sXG5cbiAgICAvLyBwZXIgZnJhbWUgc3R1ZmZcbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICBpZiAoIXRoaXMuYm94KSB7XG4gICAgICAgICAgICAvLyBoYXZlbid0IGZpbmlzaGVkIGluaXRpYWxpemluZyB5ZXRcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIGl0J3MgaW50ZXJhY3RpdmUsIHdlJ2xsIGhhbmRsZSBkcmFnIGFuZCBob3ZlciBldmVudHNcbiAgICAgICAgaWYgKHRoaXMuaXNJbnRlcmFjdGl2ZSkge1xuXG4gICAgICAgICAgICAvLyBpZiB3ZSdyZSBkcmFnZ2luZywgdXBkYXRlIHRoZSByb3RhdGlvblxuICAgICAgICAgICAgaWYgKHRoaXMuaXNEcmFnZ2FibGUgJiYgdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5pc0RyYWdnaW5nKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBkbyBzb21ldGhpbmcgd2l0aCB0aGUgZHJhZ2dpbmcuIEhlcmUsIHdlJ2xsIHVzZSBkZWx0YS54IGFuZCBkZWx0YS55XG4gICAgICAgICAgICAgICAgLy8gdG8gcm90YXRlIHRoZSBvYmplY3QuICBUaGVzZSB2YWx1ZXMgYXJlIHNldCBhcyBhIHJlbGF0aXZlIG9mZnNldCBpblxuICAgICAgICAgICAgICAgIC8vIHRoZSBwbGFuZSBwZXJwZW5kaWN1bGFyIHRvIHRoZSB2aWV3LCBzbyB3ZSdsbCB1c2UgdGhlbSB0byBvZmZzZXQgdGhlXG4gICAgICAgICAgICAgICAgLy8geCBhbmQgeSByb3RhdGlvbiBvZiB0aGUgb2JqZWN0LiAgVGhpcyBpcyBhIFRFUlJJQkxFIHdheSB0byBkbyByb3RhdGUsXG4gICAgICAgICAgICAgICAgLy8gYnV0IGl0J3MgYSBzaW1wbGUgZXhhbXBsZS5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jbGlja0ludGVyc2VjdGlvbi5vYmplY3QgPT0gdGhpcy5ib3gpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gdXBkYXRlIGRyYWcgc3RhdGVcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5kcmFnKClcblxuICAgICAgICAgICAgICAgICAgICAvLyBjb21wdXRlIGEgbmV3IHJvdGF0aW9uIGJhc2VkIG9uIHRoZSBkZWx0YVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJveC5yb3RhdGlvbi5zZXQodGhpcy5pbml0aWFsRXVsZXIueCAtIHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZGVsdGEueCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW5pdGlhbEV1bGVyLnkgKyB0aGlzLmhhbmRsZUludGVyYWN0aW9uLmRlbHRhLnksXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmluaXRpYWxFdWxlci56KVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSB0aGUgc2hhcmVkIHJvdGF0aW9uXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkRXVsZXIodGhpcy5ib3gucm90YXRpb24pXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmNsaWNrSW50ZXJzZWN0aW9uLm9iamVjdCA9PSB0aGlzLmJveDIpIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyB3ZSB3YW50IHRvIGhpdCB0ZXN0IG9uIG91ciBib3hlcywgYnV0IG9ubHkgd2FudCB0byBrbm93IGlmL3doZXJlXG4gICAgICAgICAgICAgICAgICAgIC8vIHdlIGhpdCB0aGUgYmlnIGJveC4gIFNvIGZpcnN0IGhpZGUgdGhlIHNtYWxsIGJveCwgYW5kIHRoZW4gZG8gYVxuICAgICAgICAgICAgICAgICAgICAvLyBhIGhpdCB0ZXN0LCB3aGljaCBjYW4gb25seSByZXN1bHQgaW4gYSBoaXQgb24gdGhlIGJpZyBib3guICBcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ib3gyLnZpc2libGUgPSBmYWxzZVxuICAgICAgICAgICAgICAgICAgICBsZXQgaW50ZXJzZWN0ID0gdGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5nZXRJbnRlcnNlY3Rpb24odGhpcy5oYW5kbGVJbnRlcmFjdGlvbi5kcmFnSW50ZXJhY3RvciwgW3RoaXMuYm94XSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ib3gyLnZpc2libGUgPSB0cnVlXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgd2UgaGl0IHRoZSBiaWcgYm94LCBtb3ZlIHRoZSBzbWFsbCBib3ggdG8gdGhlIHBvc2l0aW9uIG9mIHRoZSBoaXRcbiAgICAgICAgICAgICAgICAgICAgaWYgKGludGVyc2VjdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGludGVyc2VjdCBvYmplY3QgaXMgYSBUSFJFRS5JbnRlcnNlY3Rpb24gb2JqZWN0LCB3aGljaCBoYXMgdGhlIGhpdCBwb2ludFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3BlY2lmaWVkIGluIHdvcmxkIGNvb3JkaW5hdGVzLiAgU28gd2UgbW92ZSB0aG9zZSBjb29yZGluYXRlcyBpbnRvIHRoZSBsb2NhbFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY29vcmRpYXRlcyBvZiB0aGUgYmlnIGJveCwgYW5kIHRoZW4gc2V0IHRoZSBwb3NpdGlvbiBvZiB0aGUgc21hbGwgYm94IHRvIHRoYXRcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBwb3NpdGlvbiA9IHRoaXMuYm94LndvcmxkVG9Mb2NhbChpbnRlcnNlY3QucG9pbnQpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmJveDIucG9zaXRpb24uY29weShwb3NpdGlvbilcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U2hhcmVkUG9zaXRpb24odGhpcy5ib3gyLnBvc2l0aW9uKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBkbyBzb21ldGhpbmcgd2l0aCB0aGUgcmF5cyB3aGVuIG5vdCBkcmFnZ2luZyBvciBjbGlja2luZy5cbiAgICAgICAgICAgICAgICAvLyBGb3IgZXhhbXBsZSwgd2UgY291bGQgZGlzcGxheSBzb21lIGFkZGl0aW9uYWwgY29udGVudCB3aGVuIGhvdmVyaW5nXG4gICAgICAgICAgICAgICAgbGV0IHBhc3N0aHJ1SW50ZXJhY3RvciA9IHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZ2V0SW50ZXJhY3RvcnModGhpcy5zaW1wbGVDb250YWluZXIpO1xuXG4gICAgICAgICAgICAgICAgLy8gd2Ugd2lsbCBzZXQgeWVsbG93IGlmIGVpdGhlciBpbnRlcmFjdG9yIGhpdHMgdGhlIGJveC4gV2UnbGwga2VlcCB0cmFjayBvZiBpZlxuICAgICAgICAgICAgICAgIC8vIG9uZSBkb2VzXG4gICAgICAgICAgICAgICAgbGV0IHNldEl0ID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAvLyBmb3IgZWFjaCBvZiBvdXIgaW50ZXJhY3RvcnMsIGNoZWNrIGlmIGl0IGhpdHMgdGhlIHNjZW5lXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXNzdGhydUludGVyYWN0b3IubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGludGVyc2VjdGlvbiA9IHRoaXMuaGFuZGxlSW50ZXJhY3Rpb24uZ2V0SW50ZXJzZWN0aW9uKHBhc3N0aHJ1SW50ZXJhY3RvcltpXSwgdGhpcy5zaW1wbGVDb250YWluZXIub2JqZWN0M0QuY2hpbGRyZW4pXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgd2UgaGl0IHRoZSBzbWFsbCBib3gsIHNldCB0aGUgY29sb3IgdG8geWVsbG93LCBhbmQgZmxhZyB0aGF0IHdlIGhpdFxuICAgICAgICAgICAgICAgICAgICBpZiAoaW50ZXJzZWN0aW9uICYmIGludGVyc2VjdGlvbi5vYmplY3QgPT09IHRoaXMuYm94Mikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ib3gyLm1hdGVyaWFsLmNvbG9yLnNldChcInllbGxvd1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0SXQgPSB0cnVlXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBpZiB3ZSBkaWRuJ3QgaGl0LCBtYWtlIHN1cmUgdGhlIGNvbG9yIHJlbWFpbnMgYmxhY2tcbiAgICAgICAgICAgICAgICBpZiAoIXNldEl0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYm94Mi5tYXRlcmlhbC5jb2xvci5zZXQoXCJibGFja1wiKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmlzTmV0d29ya2VkKSB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBoYXZlbid0IGZpbmlzaGVkIHNldHRpbmcgdXAgdGhlIG5ldHdvcmtlZCBlbnRpdHkgZG9uJ3QgZG8gYW55dGhpbmcuXG4gICAgICAgICAgICBpZiAoIXRoaXMubmV0RW50aXR5IHx8ICF0aGlzLnN0YXRlU3luYykge1xuICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpZiB0aGUgc3RhdGUgaGFzIGNoYW5nZWQgaW4gdGhlIG5ldHdvcmtlZCBkYXRhLCB1cGRhdGUgb3VyIGh0bWwgb2JqZWN0XG4gICAgICAgICAgICBpZiAodGhpcy5zdGF0ZVN5bmMuY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGVTeW5jLmNoYW5nZWQgPSBmYWxzZVxuXG4gICAgICAgICAgICAgICAgLy8gZ290IHRoZSBkYXRhLCBub3cgZG8gc29tZXRoaW5nIHdpdGggaXRcbiAgICAgICAgICAgICAgICBsZXQgbmV3RGF0YSA9IHRoaXMuc3RhdGVTeW5jLmRhdGFPYmplY3RcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEuY29sb3Iuc2V0KG5ld0RhdGEuY29sb3IpXG4gICAgICAgICAgICAgICAgdGhpcy5zaGFyZWREYXRhLnJvdGF0aW9uLmNvcHkobmV3RGF0YS5yb3RhdGlvbilcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXJlZERhdGEucG9zaXRpb24uY29weShuZXdEYXRhLnBvc2l0aW9uKVxuICAgICAgICAgICAgICAgIHRoaXMuYm94Lm1hdGVyaWFsLmNvbG9yLnNldChuZXdEYXRhLmNvbG9yKVxuICAgICAgICAgICAgICAgIHRoaXMuYm94LnJvdGF0aW9uLmNvcHkobmV3RGF0YS5yb3RhdGlvbilcbiAgICAgICAgICAgICAgICB0aGlzLmJveDIucG9zaXRpb24uY29weShuZXdEYXRhLnBvc2l0aW9uKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyByZWdpc3RlciB0aGUgY29tcG9uZW50IHdpdGggdGhlIEFGcmFtZSBzY2VuZVxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KGNvbXBvbmVudE5hbWUsIHtcbiAgICAuLi5jaGlsZCxcbiAgICAuLi50ZW1wbGF0ZVxufSlcblxuLy8gY3JlYXRlIGFuZCByZWdpc3RlciB0aGUgZGF0YSBjb21wb25lbnQgYW5kIGl0J3MgTkFGIGNvbXBvbmVudCB3aXRoIHRoZSBBRnJhbWUgc2NlbmVcbnJlZ2lzdGVyU2hhcmVkQUZSQU1FQ29tcG9uZW50cyhjb21wb25lbnROYW1lKSIsImNvbnN0IHdvcmxkQ2FtZXJhUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKSAgXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudCgnc2hvdy1oaWRlJywge1xuICAgIHNjaGVtYToge1xuICAgICAgICByYWRpdXM6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IDEgfSxcbiAgICAgICAgc2hvd0Nsb3NlOiB7IHR5cGU6ICdib29sZWFuJywgZGVmYXVsdDogdHJ1ZSB9LFxuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuaW5uZXJSYWRpdXMgPSB0aGlzLmRhdGEucmFkaXVzICogMC45NTtcbiAgICAgICAgdGhpcy5vdXRlclJhZGl1cyA9IHRoaXMuZGF0YS5yYWRpdXMgKiAxLjA1O1xuICAgIH0sXG5cbiAgICB0aWNrOiBmdW5jdGlvbiAodGltZSkge1xuICAgICAgICB0aGlzLmVsLnNjZW5lRWwuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24od29ybGRDYW1lcmFQb3MpO1xuICAgICAgICB0aGlzLmVsLm9iamVjdDNELndvcmxkVG9Mb2NhbCh3b3JsZENhbWVyYVBvcyk7XG5cbiAgICAgICAgbGV0IGwgPSB3b3JsZENhbWVyYVBvcy5sZW5ndGgoKTtcbiAgICAgICAgaWYgKGwgPCB0aGlzLmlubmVyUmFkaXVzKSB7XG4gICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSB0aGlzLmRhdGEuc2hvd0Nsb3NlO1xuICAgICAgICB9IGVsc2UgaWYgKGwgPiB0aGlzLm91dGVyUmFkaXVzKSB7XG4gICAgICAgICAgICB0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSAhdGhpcy5kYXRhLnNob3dDbG9zZTtcbiAgICAgICAgfVxuICAgIH1cbn0pIiwiaW1wb3J0ICcuLi9zeXN0ZW1zL2ZhZGVyLXBsdXMuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcG9ydGFsLmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2ltbWVyc2l2ZS0zNjAuanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvcGFyYWxsYXguanMnXG5pbXBvcnQgJy4uL2NvbXBvbmVudHMvc2hhZGVyLnRzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL2h0bWwtc2NyaXB0LmpzJ1xuaW1wb3J0ICcuLi9jb21wb25lbnRzL3JlZ2lvbi1oaWRlci5qcydcbmltcG9ydCAnLi4vY29tcG9uZW50cy92aWRlby1jb250cm9sLXBhZCdcbmltcG9ydCAnLi4vY29tcG9uZW50cy90aHJlZS1zYW1wbGUuanMnXG5pbXBvcnQgXCIuLi9jb21wb25lbnRzL3Nob3ctaGlkZS5qc1wiXG5cbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdpbW1lcnNpdmUtMzYwJywgJ2ltbWVyc2l2ZS0zNjAnKTtcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdwb3J0YWwnLCAncG9ydGFsJyk7XG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgnc2hhZGVyJywgJ3NoYWRlcicpO1xuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3BhcmFsbGF4JywgJ3BhcmFsbGF4Jyk7XG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgnaHRtbC1zY3JpcHQnLCAnaHRtbC1zY3JpcHQnKTtcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdyZWdpb24taGlkZXInLCAncmVnaW9uLWhpZGVyJyk7XG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgndmlkZW8tY29udHJvbC1wYWQnLCAndmlkZW8tY29udHJvbC1wYWQnKTtcbkFGUkFNRS5HTFRGTW9kZWxQbHVzLnJlZ2lzdGVyQ29tcG9uZW50KCdzaG93LWhpZGUnLCAnc2hvdy1oaWRlJyk7XG5BRlJBTUUuR0xURk1vZGVsUGx1cy5yZWdpc3RlckNvbXBvbmVudCgndGVzdC1jdWJlJywgJ3Rlc3QtY3ViZScpO1xuQUZSQU1FLkdMVEZNb2RlbFBsdXMucmVnaXN0ZXJDb21wb25lbnQoJ3Rlc3QtY3ViZScsICd0ZXN0LWN1YmUnKTtcblxuLy8gZG8gYSBzaW1wbGUgbW9ua2V5IHBhdGNoIHRvIHNlZSBpZiBpdCB3b3Jrc1xuXG4vLyB2YXIgbXlpc01pbmVPckxvY2FsID0gZnVuY3Rpb24gKHRoYXQpIHtcbi8vICAgICByZXR1cm4gIXRoYXQuZWwuY29tcG9uZW50cy5uZXR3b3JrZWQgfHwgKHRoYXQubmV0d29ya2VkRWwgJiYgTkFGLnV0aWxzLmlzTWluZSh0aGF0Lm5ldHdvcmtlZEVsKSk7XG4vLyAgfVxuXG4vLyAgdmFyIHZpZGVvQ29tcCA9IEFGUkFNRS5jb21wb25lbnRzW1wibWVkaWEtdmlkZW9cIl1cbi8vICB2aWRlb0NvbXAuQ29tcG9uZW50LnByb3RvdHlwZS5pc01pbmVPckxvY2FsID0gbXlpc01pbmVPckxvY2FsO1xuXG4vLyBhZGQgdGhlIHJlZ2lvbi1oaWRlciB0byB0aGUgc2NlbmVcbi8vIGNvbnN0IHNjZW5lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcImEtc2NlbmVcIik7XG4vLyBzY2VuZS5zZXRBdHRyaWJ1dGUoXCJyZWdpb24taGlkZXJcIiwge3NpemU6IDEwMH0pXG5cblxuZnVuY3Rpb24gaGlkZUxvYmJ5U3BoZXJlKCkge1xuICAgIC8vIEB0cy1pZ25vcmVcbiAgICB3aW5kb3cuQVBQLnNjZW5lLmFkZEV2ZW50TGlzdGVuZXIoJ3N0YXRlYWRkZWQnLCBmdW5jdGlvbihldnQ6Q3VzdG9tRXZlbnQpIHsgXG4gICAgICAgIGlmIChldnQuZGV0YWlsID09PSAnZW50ZXJlZCcpIHtcbiAgICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICAgIHZhciBsb2JieVNwaGVyZSA9IHdpbmRvdy5BUFAuc2NlbmUub2JqZWN0M0QuZ2V0T2JqZWN0QnlOYW1lKCdsb2JieVNwaGVyZScpXG4gICAgICAgICAgICBpZiAobG9iYnlTcGhlcmUpIHtcbiAgICAgICAgICAgICAgICBsb2JieVNwaGVyZS52aXNpYmxlID0gZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5pZiAoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gJ2NvbXBsZXRlJykge1xuICAgIGhpZGVMb2JieVNwaGVyZSgpO1xufSBlbHNlIHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgaGlkZUxvYmJ5U3BoZXJlKTtcbn0iXSwibmFtZXMiOlsid29ybGRDYW1lcmEiLCJ3b3JsZFNlbGYiLCJkZWZhdWx0SG9va3MiLCJnbHNsIiwidW5pZm9ybXMiLCJsb2FkZXIiLCJub2lzZVRleCIsInNtYWxsTm9pc2UiLCJ3YXJwVGV4IiwiaW52ZXJzZTR4NCIsInNub2lzZSIsIk1hdGVyaWFsTW9kaWZpZXIiLCJvbmNlIiwid29ybGRDYW1lcmFQb3MiLCJodG1sQ29tcG9uZW50cyIsInBhbm92ZXJ0IiwicGFub2ZyYWciXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU0sQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFO0FBQ3BDLEVBQUUsTUFBTSxFQUFFO0FBQ1YsSUFBSSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUU7QUFDbEQsSUFBSSxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUU7QUFDOUMsSUFBSSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUU7QUFDOUMsR0FBRztBQUNIO0FBQ0EsRUFBRSxJQUFJLEdBQUc7QUFDVCxJQUFJLE1BQU0sSUFBSSxHQUFHLElBQUksS0FBSyxDQUFDLElBQUk7QUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUU7QUFDN0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQztBQUNsQyxRQUFRLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUs7QUFDOUIsUUFBUSxJQUFJLEVBQUUsS0FBSyxDQUFDLFFBQVE7QUFDNUIsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUNsQixRQUFRLFdBQVcsRUFBRSxJQUFJO0FBQ3pCLFFBQVEsR0FBRyxFQUFFLEtBQUs7QUFDbEIsT0FBTyxDQUFDO0FBQ1IsTUFBSztBQUNMLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBQztBQUNuQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEtBQUk7QUFDdkIsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEdBQUcsS0FBSTtBQUNqQyxJQUFJLElBQUksQ0FB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QUFLLENBQUMsVUFBVSxFQUFFO1FBQzFDLFlBQVksRUFBRSxFQUFFLEtBQUssRUFBZ0MsQ0FBQyxDQUFJLEVBQUU7UUFDNUQsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUU7UUFDcEMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDcEQsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDdkQsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDdkQsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDdkQsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDdkQsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUU7UUFDbEMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUU7UUFDbEMsY0FBYyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxXQUFXLEVBQUU7UUFDNUMsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUU7UUFDcEMsT0FBTyxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRTtRQUNyQixZQUFZLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUM3RCxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsT0FBTyxD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

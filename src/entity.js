//DESC: ENTITIES ARE OBJECTS REPRESENTED IN THE X, Y COORDINATE SPACE
"use strict";

//LOADED
console.log("Loaded: entity.js");

//REQUIREMENTS
const $VECTOR = require('./general.js').vector;
const $BOUNDS = require('./bounds.js');
const $EVENTS = require('./events.js');
const $UUID   = require('uuid/v4');

/*
  ____           _____ ______    _____ _                _____ _____
 |  _ \   /\    / ____|  ____|  / ____| |        /\    / ____/ ____|
 | |_) | /  \  | (___ | |__    | |    | |       /  \  | (___| (___
 |  _ < / /\ \  \___ \|  __|   | |    | |      / /\ \  \___ \\___ \
 | |_) / ____ \ ____) | |____  | |____| |____ / ____ \ ____) |___) |
 |____/_/    \_\_____/|______|  \_____|______/_/    \_\_____/_____/
*/

//Entity base class
class Entity {

    constructor (x, y) {
        this.x = x;
        this.y = y;

        //Angle
        this.a = 0; //Not used in all entities

        this.id = $UUID();

        this.events = new $EVENTS.handler();
        this.changed = false;
        this.collides = false;

        this.type = 'entity'; //Type of entity
        this.bounds = new $BOUNDS.bounds.point(this.x, this.y);

        let self = this;
        this.events.on('killed', function () {
            self.alive = false;
        });
        this.alive = true;
    }

    //If its angle gets changed, mark as changed
    set angle (angle) {
        this.a = angle;
        this.changed = true;
    }

    get angle () {
        return this.a;
    }

    //EVENT WRAPPERS
    //Kill
    onKill (handler) {
        this.events.on('killed', handler);
    }

    kill () {
        this.events.emit('killed');
        this.alive = false; //Once finished death calls
    }

    //Update
    onUpdate (handler) {
        this.events.on('update', handler);
    }

    update (dt) {
        this.events.emit('update', dt);
    }

    //Collide
    onCollide (handler) {
        this.events.on('collide', handler);
    }

    //collision referencing what it collided with
    collide (collision, dt) {
        this.events.emit('collide', collision, dt)
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            type: this.type,
            id: this.id,
            alive: this.alive
        }
    }

}

/*
  ____           _____ _____ _____   ______ _   _ _______ _____
 |  _ \   /\    / ____|_   _/ ____| |  ____| \ | |__   __/ ____|
 | |_) | /  \  | (___   | || |      | |__  |  \| |  | | | (___
 |  _ < / /\ \  \___ \  | || |      |  __| | . ` |  | |  \___ \
 | |_) / ____ \ ____) |_| || |____  | |____| |\  |  | |  ____) |
 |____/_/    \_\_____/|_____\_____| |______|_| \_|  |_| |_____/
 */

//WALL
//For static, immovable rectangular objects
class Wall extends Entity {

    constructor (x, y, w, h) {
        super(x, y);
        this.w = w;
        this.h = h;

        //Used in physics as infinite mass
        this.collides = true;

        this.type = 'wall';
        this.bounds = new $BOUNDS.bounds.box(this.x, this.y, w, h);
    }

    //Get the minimum data for client transfer
    scrape () {
        return {
            x: this.x,
            y: this.y,
            w: this.w,
            h: this.h,
            type: this.type,
            id: this.id,
            alive: this.alive
        }
    }

}

//LIGHT
//For (typically) static lights
class Light extends Entity {

    constructor (x, y, color, intensity, distance) {
        super (x, y);
        this.color = color;
        this.intensity = intensity;
        this.distance = distance;

        this.type = 'light';
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            color: this.color,
            intensity: this.intensity,
            distance: this.distance,
            type: this.type,
            id: this.id,
            alive: this.alive
        };
    }

}

/*
  _____  _    ___     _______ _____ _____  _____
 |  __ \| |  | \ \   / / ____|_   _/ ____|/ ____|
 | |__) | |__| |\ \_/ / (___   | || |    | (___
 |  ___/|  __  | \   / \___ \  | || |     \___ \
 | |    | |  | |  | |  ____) |_| || |____ ____) |
 |_|    |_|  |_|  |_| |_____/|_____\_____|_____/
*/

//PHYSICS
//Using the metric system, 1u = 1m (roughly)
const $FRICTION  = 1.2; //Very high coefficient of friction
const $GRAVITY   = 9.81; //Acceleration due to gravity ms^-2
const $AIR       = 1.225; //Mass density of air kgm^3
//Inherits point bounds
//Classes using physics should inherit from this, and modify bounds
class Physics extends Entity {

    constructor (x, y) {
        super(x, y);
        this.physics = true;

        //Velocity
        this.velocity = {x: 0, y: 0};

        //Force and Momentum
        this.forces = [];
        this.mass = 100;

        //Friction
        this.friction = this.mass * $GRAVITY * $FRICTION; //Magnitude of normal force

        //Drag
        this.area = 0.1; //Cross sectional area, should be 0 but required for drag
        this.drag = 1.2; //Drag coefficient of a standing man

        //Physics collisions
        this.collisions = [];
        this.collides = true;

        let self = this; //Reference to entity
        //Set changed
        //Physics calcs when updated
        this.onUpdate(function (dt) {

            //dt in ms, so convert to s
            dt = dt/1000;

            //Calculate total force on entity
            let force = {x: 0, y: 0};
            for (let i = 0; i < self.forces.length; i++) {
                force = $VECTOR.add(force, self.forces[i]);
            }

            //Create a copy of pre-collision force
            let colForce = {};
            Object.assign(colForce, force);

            //Collision handling
            //Only handles forces acting on self
            for (let i = 0; i < self.collisions.length; i++) {
                let collision = self.collisions[i];
                let normal = collision.normal;

                //If wall collision
                if (collision.static) {
                    //Normal is normalised so can be used with dot product for magnitude of value in dir of normal
                    //Scalar momentum in direction of normal
                    let p = $VECTOR.dot(normal, self.velocity) * self.mass;

                    //Scalar force in direction of normal
                    let f = $VECTOR.dot(normal, colForce);

                    //Only acting in direction of normal
                    p = p < 0 ? 0 : p;
                    f = f < 0 ? 0 : f;

                    //Momentum *-1.4 for bounce (not physically correct, but feels more natural)
                    p = p*-1.4;
                    //Force *-1 to stop movement
                    f = f*-1;
                    //Add impulse to force (p=f*dt)
                    f = f + (p/dt);

                    //Add force in direction of normal to net force
                    force = $VECTOR.add(force, $VECTOR.pro(f, normal));

                    //TODO fix double bounce from walls
                    //^ If collides with two walls, gets force from both
                }
                //If dynamic collision
                else {

                    //Find impulse of other on self
                    let vel = collision.velocity;
                    let mass = collision.mass;

                    //Scalar momentum in direction of normal
                    let p = $VECTOR.dot(normal, vel) * mass;
                    p = p > 0 ? 0 : p;

                    //Add impulse to net force
                    force = $VECTOR.add(force, $VECTOR.pro(p/dt, normal));

                    //Remove impulse of self on other
                    p = $VECTOR.dot(normal, self.velocity) * mass;
                    force = $VECTOR.add(force, $VECTOR.pro(-p/dt, normal));
                    //TODO add force resistance
                    //I have no idea how to get other entities forces into the update cycle
                    //I could split the cycle into smaller chunks but I'd rather not
                    //That's the only solution I can see though.

                }

            }

            //New velocity from force, for resistance calcs
            let vel = $VECTOR.pro(dt, $VECTOR.pro(1/self.mass, force));
            vel = $VECTOR.add(self.velocity, vel);

            let speed = $VECTOR.mag(vel);

            //Apply friction
            if (speed > 0.2 || $VECTOR.mag(force) > self.friction) {
                //speed>0.2 because needs a buffer between 0 so friction doesn't cause the entity to 'shake'
                //force>friction so force great enough to do something
                let friction = $VECTOR.vfd(self.friction, $VECTOR.ang(vel)); //In direction of friction
                friction = $VECTOR.pro(-1, friction); //In opposite direction to force
                force = $VECTOR.add(force, friction); //Total forces
            }
            else {
                self.velocity = {x: 0, y: 0};
            }

            //Drag
            if (speed > 1) {
                //Using the equation Fd = 0.5p(u^2)A
                let scalarDrag = 0.5 * $AIR * speed * speed * self.area;
                //Normalise velocity and multiply by -drag for drag force
                let drag = $VECTOR.pro(-scalarDrag, $VECTOR.nrm(vel));
                force = $VECTOR.add(force, drag);
            }

            //Final velocity calculation
            vel = $VECTOR.pro(dt, $VECTOR.pro(1/self.mass, force));
            self.velocity = $VECTOR.add(self.velocity, vel);

            //Update entity position
            let dp = $VECTOR.pro(dt, self.velocity);
            if (self.x !== self.x + dp.x || self.y !== self.y + dp.y) {
                self.changed = true;
                self.x = self.x + dp.x;
                self.y = self.y + dp.y;
                self.bounds.update(self.x, self.y);
            }
            self.forces = [];
            self.collisions = [];
        });

        //Handle collisions
        this.onCollide(function (entity) {
            //Collision physics must be calculated during the update loop with forces.
            //As such, this is used to obtain the relevant collision information.

            //The collides property used to determine if used in physics collisions
            if (entity.collides && self.collides) {
                //Normal away from self
                let normal = self.bounds.getNormal(entity.bounds);

                //Add to collisions as object containing relevant information
                let collision = {};
                collision.normal = normal;
                collision.static = !entity.physics; //If infinite mass (e.g. walls)

                //Include mass and copy of velocity for dynamic entities
                if (entity.physics) {
                    collision.mass = entity.mass;
                    let vel = {};
                    Object.assign(vel, entity.velocity);
                    collision.velocity = vel;
                }

                //Push to collisions for physics in update loop
                self.collisions.push(collision);
            }
        });

        this.type = 'phys';
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            id: this.id,
            type: this.type,
            alive: this.alive
        };
    }

}

//BARREL (PROP) CLASS
class Barrel extends Physics {

    constructor (x, y) {
        super(x, y);
        this.radius = 0.6;

        //300kg
        this.mass = 100;

        //Area for drag
        this.area = this.radius * this.radius;

        //Circle bounds
        this.bounds = new $BOUNDS.bounds.circle(this.x, this.y, this.radius);

        //BEHAVIOUR
        this.maxHealth = 3;
        this.health = 3;

        let self = this;
        //Damaged
        this.onCollide(function (entity) {
            if (entity.damage && entity.damage > 0) {
                self.health = self.health - entity.damage;
                if (self.health <= 0) {
                    self.kill();
                }
            }
        });

        this.type = 'barrel';
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            health: this.health/this.maxHealth,
            id: this.id,
            type: this.type,
            alive: this.alive
        }
    }

}

/*
 __          ________          _____   ____  _   _  _____
 \ \        / /  ____|   /\   |  __ \ / __ \| \ | |/ ____|
  \ \  /\  / /| |__     /  \  | |__) | |  | |  \| | (___
   \ \/  \/ / |  __|   / /\ \ |  ___/| |  | | . ` |\___ \
    \  /\  /  | |____ / ____ \| |    | |__| | |\  |____) |
     \/  \/   |______/_/    \_\_|     \____/|_| \_|_____/
 */

//PROJECTILE CLASS
//Fired by players and such to do damage
class Projectile extends Physics {

    constructor (x, y, force, r, mass, damage, friendly, lifespan) {
        super (x, y);
        //PHYSICS
        this.radius = r || 0.3;
        this.mass = mass || 10;
        this.forces.push(force);

        //Doesn't bounce things
        this.collides = false;

        //Area for drag
        this.area = this.radius * this.radius; //Assume in cube

        //BEHAVIOUR
        this.damage = damage || 1;
        this.friendly = true;

        this.lifespan = lifespan || 3000; //ms

        this.source = undefined; //Placed here for doc reasons - know there is a property called source

        //Kill when lifespan exceeded
        let self = this;
        this.onUpdate(function (dt) {
            self.lifespan = self.lifespan - dt;
            if (self.lifespan <= 0) {
                self.kill();
            }
        });

        //Do angle
        this.onUpdate(function () {
            if ($VECTOR.mag(self.velocity) > 2) {
                let dir = $VECTOR.nrm(self.velocity);
                dir.x = dir.x * -1;
                let angle = $VECTOR.ang(dir);
                self.a = angle;
            }
        });

        this.onCollide(function (entity) {
            if (!entity.friendly) { //Collides with anything but players
                self.kill();
            }
        });

        //BOUNDS
        this.bounds = new $BOUNDS.bounds.circle(this.x, this.y, this.radius);

        this.type = 'phys';
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            a: this.a,
            id: this.id,
            type: this.type,
            alive: this.alive
        };
    }

}

//AREA OF EFFECT ATTACK USED BY MAGE
class AreaOfEffect extends Entity {

    constructor (x, y) {
        super(x, y);

        //FUNCTIONALITY
        this.source = undefined;
        
        this.damage = 1;
        
        this.friendly = true;
        this.lifetime = 1500; //ms
        
        this.increaseRate = (1.5 - 0.2)/this.lifetime;
        this.maxRadius    = 1.5;
        
        let self = this;
        this.onUpdate(function (dt) {
            //Increase radius
            let radius    = self.radius + dt*self.increaseRate;
            self.radius   = radius > self.maxRadius ? self.maxRadius : radius;
            self.bounds.r = self.radius;
            self.changed  = true;

            //Lifetime
            if (self.lifetime > 0) {
                self.lifetime = self.lifetime - dt;
            }
            else {
                self.kill();
            }
        });

        //BOUNDS
        this.radius = 0.2;
        this.bounds = new $BOUNDS.bounds.circle(this.x, this.y, this.radius);

        this.type = 'aoe';
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            r: this.radius,
            id: this.id,
            type: this.type,
            alive: this.alive
        };
    }

}

/*
  ______ _   _ ______ __  __ _____ ______  _____
 |  ____| \ | |  ____|  \/  |_   _|  ____|/ ____|
 | |__  |  \| | |__  | \  / | | | | |__  | (___
 |  __| | . ` |  __| | |\/| | | | |  __|  \___ \
 | |____| |\  | |____| |  | |_| |_| |____ ____) |
 |______|_| \_|______|_|  |_|_____|______|_____/
 */

//ENEMY AI STATES
//Used client-side for animation
const $AI_STATES = {
    still: 0,
    follow: 1,
    flee: 2
};

//ENEMY BASE CLASS
class Enemy extends Physics {

    constructor (x, y, mass, force, health, follow, flee) {
        super(x, y);

        //PHYSICS
        this.mass   = mass  || this.mass;
        this.force  = force || 1900; //Magnitude of driving force

        //DEFAULTS
        this.maxHealth = health || 3;
        this.health    = health || 3;

        //BEHAVIOUR
        this.ai        = true;
        this.friendly  = false;
        this.damage    = 1;
        this.follow    = new $BOUNDS.bounds.circle(x, y, follow || 12); //Circle bounds to tell if players inside
        this.flee      = flee || 0;  //Radius of enemies to flee
        this.minHealth = 0; //If health falls below, flee
        this.xp        = 10;
        this.hitxp     = 5;

        //Active weapons
        this.weapons = [];

        this.state = $AI_STATES.still; //Enum indicating how the enemy should behave
        this.nearest = undefined; //Nearest player
        
        //So doesn't take constant damage
        this.dmgInterval = 300; //300ms
        this.lastDmg     = 300;

        let self = this;
        //Damage
        this.onCollide(function (entity) {
            //Damage from a player weapon
            if (self.lastDmg >= self.dmgInterval && entity.friendly && entity.damage) {
                self.health = self.health - entity.damage;
                if (self.health <= 0) {
                    //Give player charge equal to xp worth
                    if (entity.source) {
                        entity.source.gainXP(self.xp);
                    }
                    self.kill();
                }
                else {
                    //Give player charge - 5 for hit
                    if (entity.source) {
                        entity.source.gainXP(self.hitxp);
                    }
                }
                self.lastDmg = 0;
            }
        });
        
        //Increase last damage
        this.onUpdate(function (dt) {
            if (self.lastDmg < self.dmgInterval) {
                self.lastDmg = self.lastDmg + dt;
            }
        });

        //Update follow bounds after move
        this.onUpdate(function () {
            self.follow.x = self.x;
            self.follow.y = self.y;
        });

        //Receive players in follow radius
        this.onAction(function (players) {
            if (players.length > 0) {
                let min = self.follow.radius + 1; //Min distance
                let nearest; //Nearest player

                //Find nearest player
                for (let i = 0; i < players.length; i++) {
                    let ply = players[i];
                    let dir = $VECTOR.add({x: ply.x, y: ply.y}, $VECTOR.pro(-1, {x: self.x, y: self.y}));

                    let dist = $VECTOR.mag(dir);
                    if (dist < min) {
                        min = dist;
                        nearest = ply;
                    }
                }

                //Add force in direction of nearest player
                if (nearest) {
                    let dir = $VECTOR.add({x: nearest.x, y: nearest.y}, $VECTOR.pro(-1, {x: self.x, y: self.y}));
                    dir = $VECTOR.nrm(dir); //Normalise

                    //Flee if nearest is below flee radius
                    if (min <= self.flee || self.health <= self.minHealth) {
                        self.state = $AI_STATES.flee; //Handle own fleeing behaviour
                    }
                    else {
                        self.state = $AI_STATES.follow;
                        //Move in direction of player
                        let force = $VECTOR.pro(dir, self.force);
                        self.forces.push(force);

                        //Look at target
                        dir.x = dir.x * -1; //Not sure why I have to do this
                        self.a = $VECTOR.ang(dir);
                    }
                }

                //For other actions to use
                self.nearest = nearest;
            }
            else {
                self.state = $AI_STATES.still;
                //No nearest
                self.nearest = undefined;
            }
        });

        this.type = 'enemy'
    }

    //WHAT THE AI WILL DO
    onAction (func) {
        this.events.on('action', func);
    }

    action (players) {
        this.events.emit('action', players);
    }

    //No scrape, this should never be sent to client

}

//WOLF
//Simplest enemy
class Wolf extends Enemy {

    constructor (x, y) {
        super(x, y, 65, 1900, 3);
        //PHYSICS
        this.radius = 0.5;

        //Area for drag
        this.area = this.radius * this.radius;

        //BOUNDS
        this.bounds = new $BOUNDS.bounds.circle(x, y, this.radius);

        this.type = 'wolf';
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            a: this.a,
            health: this.health/this.maxHealth,
            state: this.state,
            id: this.id,
            type: this.type,
            alive: this.alive
        };
    }

}

//CENTURION
//Large, powerful and more complex enemy
class Centurion extends Enemy {

    constructor (x, y) {
        super(x, y, 100, 1800, 4, 20);
        this.minHealth = 1;
        this.xp        = 30;
        this.hitxp     = 10;

        //PHYSICS
        this.radius = 0.9;

        //Area for drag
        this.area = this.radius * this.radius;

        this.source = undefined; //Set when created by furnace, otherwise gone
        this.node   = undefined; //Set when fleeing

        let self = this;
        //Flee behaviour
        this.onAction(function () {
            if (self.state === $AI_STATES.flee) {

                //If furnace still alive
                if (self.source) {
                    //If has a node to move to, check if inside bounds, or if no node
                    //Doesn't work every time to get to furnace because of walls blocking nearest nodes
                    //But it's better than nothing
                    if (!self.node || (self.node && self.node.bounds.inBounds(self.bounds))) {
                        self.node = self.source.nextNode(self.x, self.y, self.node);
                    }

                    //Move towards node
                    let dir = $VECTOR.nrm($VECTOR.add($VECTOR.pro(-1, {x: self.x, y: self.y}), self.node.pos));

                    let force = $VECTOR.pro(self.force, dir);
                    self.forces.push(force);

                    //Look at target
                    dir.x = dir.x * -1;
                    self.a = $VECTOR.ang(dir);
                }
                //Move away from nearest player
                else if (self.nearest) {
                    let ply = self.nearest;
                    let dir = $VECTOR.nrm($VECTOR.add($VECTOR.pro(-1, {x: ply.x, y: ply.y}), {x: self.x, y: self.y}));

                    let force = $VECTOR.pro(dir, self.force);
                    self.forces.push(force);

                    //Look at target
                    dir.x = dir.x * -1;
                    self.a = $VECTOR.ang(dir);
                }

                //Otherwise stay put
            }
        });

        //BOUNDS
        this.bounds = new $BOUNDS.bounds.circle(x, y, this.radius);

        this.type = 'centurion';
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            a: this.a,
            health: this.health/this.maxHealth,
            state: this.state,
            id: this.id,
            type: this.type,
            alive: this.alive
        };
    }

}

//FURNACE
//A static enemy that creates and heals centurions
class Furnace extends Entity {

    constructor (x, y, nodes) {
        super(x, y);

        //PHYSICS
        this.collides = false;
        this.w = 3;
        this.h = 3;

        //FUNCTIONALITY
        //Slightly larger than model
        this.healing = new $BOUNDS.bounds.circle(this.x, this.y, 2);
        this.healRate = 2000;
        this.lastHeal = 2000;

        this.children     = [];
        this.maxChildren  = 2;
        this.childRate    = 8000;
        this.lastChild    = 8000;
        this.follow       = new $BOUNDS.bounds.circle(this.x, this.y, 20); //Start creating children
        this.makeChildren = false;

        this.health    = 7;
        this.maxHealth = 7;
        this.xp        = 200;
        this.hitxp     = 40;

        this.weapons = []; //Children added into weapons so added to game

        this.nodes = nodes;
        this.node  = this.nearestNode(x, y);

        let self = this;
        //Damage
        this.onCollide(function (entity) {
            if (entity.friendly && entity.damage > 0) {
                self.health--;
                if (entity.source) {entity.source.gainXP(self.hitxp);}
                if (self.health <= 0) {
                    self.kill();
                    if (entity.source) {entity.source.gainXP(self.xp);}
                }
            }
        });

        //Remove references to self from children on death
        this.onKill(function () {
            for (let i = 0; i < self.children.length; i++) {
                delete self.children[i].source;
            }
        });

        this.onAction(function (players) {
            if (players.length > 0) {
                self.makeChildren = true;
            }
            else {
                self.makeChildren = false;
            }
        });

        //Check for children to heal
        this.onUpdate(function (dt) {
            if (self.lastHeal < self.healRate) {
                self.lastHeal = self.healRate + dt;
            }
            else {
                let heal = [];
                for (let i = 0; i < self.children.length; i++) {
                    if (self.children[i].bounds.inBounds(self.healing)) {
                        heal.push(self.children[i]);
                    }
                }

                //Add health to each child
                for (let i = 0; i < heal.length; i++) {
                    if (heal[i].health < heal[i].maxHealth) {
                        heal[i].health = heal[i].health + 1;
                    }
                }

                self.lastHeal = 0;
            }

            self.changed = true; //progress changed
        });

        //Create centurions
        this.onUpdate(function (dt) {
            if (self.lastChild < self.childRate) {
                self.lastChild = self.lastChild + dt;
            }
            else if (self.children.length < self.maxChildren && self.makeChildren) {
                //Random angle
                let angle = Math.random() * 2*Math.PI;
                let force = {x: 12000 * Math.cos(angle), y: 12000 * Math.sin(angle)};

                let centurion = new Centurion(self.x, self.y);
                centurion.source = self;
                centurion.forces.push(force);

                centurion.onKill(function () {
                    let index = self.children.indexOf(centurion);
                    if (index > -1) {
                        self.children.splice(index, 1);
                    }
                });

                self.children.push(centurion);
                self.weapons.push(centurion);

                self.lastChild = 0;
            }
        });

        //BOUNDS (for collision)
        //Smaller than actual size so only collides with insides
        this.bounds = new $BOUNDS.bounds.box(this.x - (0.5), this.y - (0.5), 1, 1);

        this.type = 'furnace';
    }

    nearestNode (x, y) {
        let pos = {x: x, y: y};

        let node = this.nodes[0];
        let min  = $VECTOR.mag($VECTOR.add($VECTOR.pro(-1, pos), node.pos));//Distance
        for (let i = 0; i < this.nodes.length; i++) {

            let mag = $VECTOR.mag($VECTOR.add($VECTOR.pro(-1, pos), this.nodes[i].pos));
            if (mag < min) {
                min = mag;
                node = this.nodes[i];
            }

        }
        return node;
    }

    nextNode (x, y, node) {
        let mag = $VECTOR.mag($VECTOR.add($VECTOR.pro(-1, {x: x, y: y}), {x: this.x, y: this.y}));//Distance
        if (mag < 30 || node === this.node) {
            return {pos: {x: this.x, y: this.y}, bounds: this.bounds}; //Move to furnace
        }
        //Node is defined and not the same as nearest node
        else if (node) {
            let i1 = this.nodes.indexOf(this.node);
            let i2 = this.nodes.indexOf(node);

            let dir = i1-i2;
            dir = dir/dir; //Direction to go through node array

            let index = i1+dir;
            //Index in nodes array
            return this.nodes[index];
        }
        //If no node
        else {
            return this.nearestNode(x, y);
        }

    }

    //Healing functionality
    onAction (func) {
        this.events.on('action', func);
    }

    action (players) {
        this.events.emit('action', players);
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            health: this.health/this.maxHealth,
            progress: this.lastChild/this.childRate,
            id: this.id,
            type: this.type,
            alive: this.alive
        };
    }

}

/*
  _____  _           __     ________ _____   _____
 |  __ \| |        /\\ \   / /  ____|  __ \ / ____|
 | |__) | |       /  \\ \_/ /| |__  | |__) | (___
 |  ___/| |      / /\ \\   / |  __| |  _  / \___ \
 | |    | |____ / ____ \| |  | |____| | \ \ ____) |
 |_|    |______/_/    \_\_|  |______|_|  \_\_____/
*/

//PLAYER BASE CLASS
class Player extends Physics {

    constructor (x, y, r, health, ammo, charge) {
        super(x, y);
        this.nick = 'unnamed';

        //PHYSICS
        this.radius = r || 0.6;

        //A player with radius 0.8 is considered average,
        //So is given the average mass of an adult male.
        //The constant used allows for scaling.
        this.mass = this.radius * this.radius * Math.PI * 74;

        //Area for drag
        this.area = this.radius * this.radius;

        //DEFAULTS
        //XP gained over play
        this.xp = 0;

        //Player health
        this.maxHealth = health || 10;
        this.health    = health || 10;

        //Player special charge
        this.maxCharge = charge || 200;
        this.charge    = 0;

        //Attack ammo
        this.maxAmmo      = ammo || 3;
        this.ammo         = ammo || 3;
        this.cooldownTime = 1000;  //Reload time for 1 ammo, ms
        this.cooldown     = 1000; //Time reloading, ms
        this.fireRate     = 600;
        this.lastRound    = 600;

        //Active weapons
        this.weapons = []; //Game adds created weapons to world

        //Can collide with other players
        this.friendly = true;

        //Damage cooldown - brief period of time before can be damaged again
        //So monsters can't just stay touching players and doing damage
        this.dmgInterval = 700; //700ms
        this.lastDmg     = 700;

        //BOUNDS
        //Circle bounds
        this.bounds = new $BOUNDS.bounds.circle(this.x, this.y, this.radius);

        this.type = 'player';

        //BEHAVIOUR
        let self = this;
        //Damaged
        this.onCollide(function (entity) {
            if (!entity.friendly && entity.damage && self.lastDmg >= self.dmgInterval) {
                self.health = self.health - entity.damage;
                self.lastDmg = 0;
                if (self.health <= 0) {
                    self.kill();
                }
            }

        });

        //Change last damage
        this.onUpdate(function (dt) {
            if (self.lastDmg < self.dmgInterval) {
                self.lastDmg = self.lastDmg + dt;
            }
        });

        //Reload
        this.onUpdate(function (dt) {
            if (self.ammo <= 0) {
                //Reload
                self.cooldown = self.cooldown - dt;
                if (self.cooldown <= 0) {
                    self.cooldown = self.cooldownTime;
                    self.ammo = self.maxAmmo; //Add ammo
                }
            }
            //Fire rate
            if (self.lastRound < self.fireRate) {
                self.lastRound = self.lastRound + dt;
            }
        });

        //Force reload
        this.onReload(function () {
            self.ammo = 0;
        });

    }
    
    //Primary Attack Event
    onAttackPrimary (func) {
        this.events.on('attack_primary', func);
    }
    
    attackPrimary (target) {
        this.events.emit('attack_primary', target);
    }
    
    //Secondary Attack Event
    onAttackSecondary (func) {
        this.events.on('attack_secondary', func);
    }
    
    attackSecondary (target) {
        this.events.emit('attack_secondary', target);
    }

    //Special Attack Event
    onAttackSpecial (func) {
        this.events.on('attack_special', func);
    }

    attackSpecial (target) {
        this.events.emit('attack_special', target);
    }

    //Reload event
    onReload (func) {
        this.events.on('reload', func);
    }

    reload () {
        this.events.emit('reload');
    }

    //When gateway makes exit
    onExit (func) {
        this.events.on('exit', func);
    }

    exit () {
        this.events.emit('exit');
    }

    //xp
    gainXP (xp) {
        this.xp = this.xp + xp;
        let charge = this.charge + xp;
        this.charge = charge >= this.maxCharge ? this.maxCharge : charge; //Cap charge
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            a: this.a,
            id: this.id,
            nick: this.nick,
            health: this.health/this.maxHealth,
            charge: this.charge/this.maxCharge,
            ammo: this.ammo/this.maxAmmo,
            type: this.type,
            alive: this.alive
        };
    }

}

//MAGE PLAYER CLASS
class Mage extends Player {

    constructor (x, y) {
        super(x, y, 0.6, 12, 8, 100);

        this.ammoToHealth = 4;

        //ATTACK BEHAVIOUR
        let self = this;
        //Shoot projectile
        this.onAttackPrimary(function (target) {
            if (self.ammo > 0 && self.lastRound >= self.fireRate) {
                //Direction from centre to target vector
                let dir = $VECTOR.nrm($VECTOR.add($VECTOR.pro(-1, {x: self.x, y: self.y}), target));
                let force = $VECTOR.pro(17000, dir);
                let pos = $VECTOR.add($VECTOR.pro(1.5 * self.radius, dir), {x: self.x, y: self.y}); //Out of player bounds

                let projectile = new Projectile(pos.x, pos.y, force);
                projectile.source = self;

                //Add to active weapons
                self.weapons.push(projectile);

                self.ammo--;
                self.lastRound = 0;
            }
        });

        //Heal one for each seven ammo
        this.onAttackSecondary(function () {
            if (self.ammo > 0 && self.lastRound >= self.fireRate) {
                if (self.health < self.maxHealth && self.ammo >= self.ammoToHealth) {
                    let health = self.health + 3;
                    self.health = health >= self.maxHealth ? self.maxHealth : health;
                    self.ammo = self.ammo - self.ammoToHealth
                }
            }
        });

        this.onAttackSpecial(function () {
            if (self.charge >= self.maxCharge) {
                let aoe = new AreaOfEffect(self.x, self.y);
                aoe.source = self;

                self.weapons.push(aoe);
                self.charge = 0;
            }
        });

    }

}

/*
   _____          __  __ ______ _____  _           __     __
  / ____|   /\   |  \/  |  ____|  __ \| |        /\\ \   / /
 | |  __   /  \  | \  / | |__  | |__) | |       /  \\ \_/ /
 | | |_ | / /\ \ | |\/| |  __| |  ___/| |      / /\ \\   /
 | |__| |/ ____ \| |  | | |____| |    | |____ / ____ \| |
  \_____/_/    \_\_|  |_|______|_|    |______/_/    \_\_|
 */

//GATEWAY
//Marks player spawns and exits
class Gateway extends Entity {

    constructor (x, y, end) {
        super(x, y);

        //DIMENSIONS
        //3x3 units squared
        this.w = 3;
        this.h = 3;

        //BOUNDS
        this.bounds = new $BOUNDS.bounds.box(x-(1.5/2), y-(1.5/2), this.w, this.h);

        //FUNCTIONALITY
        this.open = false;
        this.end  = end || false;

        if (this.end) {
            let self = this;
            this.onAction(function (players) {
                //Make players exit world
                if (self.open) {
                    for (let i = 0; i < players.length; i++) {
                        players[i].exit();
                        players[i].kill();
                    }
                }
            });
        }

        this.type = 'gateway';
    }

    onAction (func) {
        this.events.on('action', func);
    }

    action (players) {
        this.events.emit('action', players);
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            end: this.end,
            open: this.open,
            type: this.type,
            id: this.id,
            alive: this.alive
        };
    }

}

//CHEST
//TODO inventory system and equipment has yet to be coded
//Pretty much a wall with an inventory
class Chest extends Entity {

    //Dir is a vector
    constructor (x, y, dir) {
        super (x, y);

        //Based on direction facing, give angle and create bounds
        this.a = $VECTOR.ang(dir);

        //DIMENSIONS
        this.w = dir.x === 0 ? 1 : 0.5;
        this.h = dir.y === 0 ? 1 : 0.5;

        //FUNCTIONALITY
        this.inventory = [];

        //BOUNDS
        this.bounds = new $BOUNDS.bounds.box(x, y, this.w, this.h);

        this.type = 'chest';
    }

    generateInventory () {
        //TODO
    }

    scrape () {
        return {
            x: this.x,
            y: this.y,
            type: this.type,
            id: this.id,
            alive: this.alive
        };
    }
}

/*
  ________   _______   ____  _____ _______ _____
 |  ____\ \ / /  __ \ / __ \|  __ \__   __/ ____|
 | |__   \ V /| |__) | |  | | |__) | | | | (___
 |  __|   > < |  ___/| |  | |  _  /  | |  \___ \
 | |____ / . \| |    | |__| | | \ \  | |  ____) |
 |______/_/ \_\_|     \____/|_|  \_\ |_| |_____/
 */

//ALL ENTITIES
const $ENTITIES = {
    //BASIC
    entity: Entity,
    wall: Wall,
    light: Light,
    phys: Physics,
    barrel: Barrel,

    //GAMEPLAY
    gateway: Gateway,
    chest: Chest,

    //PLAYERS
    players: {
        ply: Player,
        mage: Mage
    },

    //ENEMIES
    enemies: {
        enemy: Enemy,
        wolf: Wolf,
        centurion: Centurion,
        furnace: Furnace
    }
};

module.exports = $ENTITIES;

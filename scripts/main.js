importPackage(Packages.arc.input);
importPackage(Packages.arc.util.pooling);
global.alerts = {};
var lastUnlockTable = null;
var lastUnlockLayout = null;
function popup(intable){
	var table = new Table(Tex.button);
	table.update(() => {
		if(Vars.state.isMenu()){
			table.remove();
			lastUnlockLayout = null;
			lastUnlockTable = null;
		}
	});
	table.margin(12);
	
	table.add(intable).padRight(8);
                table.pack();
	
	var container = Core.scene.table();
	container.top().add(table);
	container.setTranslation(0, table.getPrefHeight());
	container.actions(Actions.translateBy(0, -table.getPrefHeight(), 1.0, Interp.fade), Actions.delay(2.5),
	//nesting actions() calls is necessary so the right prefHeight() is used
	Actions.run(() => container.actions(Actions.translateBy(0, table.getPrefHeight(), 1, Interp.fade), Actions.run(() => {
		lastUnlockTable = null;
		lastUnlockLayout = null;
	}), Actions.remove())));
	
	lastUnlockTable = container;
    lastUnlockLayout = intable;
}
function chatColor(color){
	return "[#"+color.toString()+"]";
}
function chatTeamColor(team){
	return "[#"+team.color.toString()+"]";
}
function toBlockEmoji(block){
	return String.fromCharCode(Fonts.getUnicode(block.name));
}
function getConstructingBlock(tile){
	if(!tile.build){
		return Blocks.air;
	}
	if(!tile.build.cblock){
		return tile.build.block;
	}
	return tile.build.cblock;
}

var eventid = 0;

function eventLogInfo(team,message){
	queue.add("E-"+eventid+" Team "+chatTeamColor(team)+team.name+"[white] "+message);
	eventid++;
}
function eventLogBlock(team,block,tile){
	if(!tile){
		return;
	}
	queue.add("E-"+eventid+" Team "+chatTeamColor(team)+team.name+"[white] has placed:"+ block.localizedName+ toBlockEmoji(block)+" at ["+ tile.x+","+tile.y+"]");
	eventid++;
}
function eventLog(team,tile){
	if(!tile){
		return;
	}
	queue.add("E-"+eventid+" Team "+chatTeamColor(team)+team.name+"[white] has placed:"+ getConstructingBlock(tile).localizedName+ " at ["+ tile.x+","+tile.y+"]");
	eventid++;
}

const Milestone = {
	name:"",
	complete:false,
	team: null,
	new(team,name){
		var f = Object.create(Milestone);
		f.name = name;
		return f;
	},
}

const BlockBuildTracker = function(atile, block,tracker){
	var tile= Vars.world.tile(atile.pos());
	if(!tile.build){
		return true;
	}
	if(tile.build.block==block){
		if((tracker.buildfilter && tracker.buildfilter(tile.build)) || !tracker.buildfilter){
			tracker.displayAlert(tile.build.team,block,tile);
		}
		return true;
	}
	if(!(tile.build instanceof ConstructBlock.ConstructBuild)){
		return true;
	}
	return false;
}


const BlockTracker={
	tile:null,
	tracker:null,
	milestone: null,
	block: null,
	done: false,
	repeatable: false,
	/*
	customText:
	*/
	new(tile,tracker,milestone,block,repeatable){
		var f = Object.create(BlockTracker);
		f.tile = tile;
		f.tracker = tracker;
		f.milestone = milestone;
		f.block=block;
		f.repeatable=repeatable;
		return f;
	},
	updateTrack(){
		var tile= this.tile;
		if(!this.repeatable){
			if(this.milestone.complete){this.done = true;return;}
			this.milestone.complete = this.tracker(tile,this.block,this);
		}else{
			this.done = this.tracker(tile,this.block,this);
		}
	},
	displayAlert(team,block,tile){
		if(!this.customText){
			eventLogBlock(team,block,tile);
		}else{
			eventLogInfo(team,this.customText(team,block,tile));
		}
	}
	
}

const BlockTrackHandler={
	milestoneName: null,
	trackerFunc:null,
	block:null,
	repeatable:false,
	properties:{},
	new(milestoneName,trackerFunc,block,repeatable,properties){
		var f = Object.create(BlockTrackHandler);
		f.milestoneName = milestoneName;
		f.block=block;
		f.trackerFunc=trackerFunc;
		f.repeatable=repeatable;
		f.properties=properties;
		return f;
	},
	processBuildingEvent(team, tile){
		var block = getConstructingBlock(tile);
		if(block==this.block){
			var teamach = getTeamAch(team);
			var milestone = teamach.getMilestone(this.milestoneName);
			if(!milestone.complete){
				let tracker = BlockTracker.new(tile,this.trackerFunc,milestone,block,this.repeatable);
				for(var propid in this.properties){
					tracker[propid] = this.properties[propid];
				}
				addTracker(tracker);
			}
		}
	},
	getId(){
		return "m "+this.milestoneName+" : "+this.block.name;
	}
}

const TeamAchievement={
	silicon: false,
	graphite: false,
	miningDrone: false,
	titanium: false,
	thorium: false,
	plast: false,
	phase: false,
	surge: false,
	foreshadow: false,
	units: null,
	team: null,
	milestones: null,
	
	
	new(team){
		var f = Object.create(TeamAchievement);
		f.team = team;
		return f;
	},
	getMilestone(name){
		if(!this.milestones){
			this.milestones = ObjectMap.of(name,Milestone.new(this.team,name));
		}
		if(!this.milestones.get(name)){
			this.milestones.put(name,Milestone.new(this.team,name));
		}
		return this.milestones.get(name);
	},
	processBuildingEvent(tile){
	},
	processUnitCreateEvent(unit){
		print(unit.name);
		if(!this.units){
			this.units = Seq.with(unit);
			eventLogInfo(this.team,"has started making "+unit.localizedName+toBlockEmoji(unit));
		}
		if(!this.units.contains(unit)){
			this.units.add(unit);
			eventLogInfo(this.team,"has started making "+unit.localizedName+toBlockEmoji(unit));
		}
	}
	
}
var blocktrackhandle=null;
var trackers = new Seq();
var teams = null;

function addTrackHandler(bth){
	if(!blocktrackhandle){
		blocktrackhandle = ObjectMap.of(bth.getId(),bth);
		return;
	}
	blocktrackhandle.put(bth.getId(),bth);
}
function addTracker(tracker){
	trackers.add(tracker);
}
function getTeamAch(team){
	if(!teams){
		teams = ObjectMap.of(team,TeamAchievement.new(team));
	}
	if(!teams.get(team)){
		teams.put(team,TeamAchievement.new(team));
	}
	return teams.get(team);
}

function inCamera(camera, x,y){
	return (Math.abs(camera.position.x - x)<camera.width*0.5 && Math.abs(camera.position.y - y)<camera.height*0.5);
}

var alerticonlow;
var alerticonhigh;
var pipicon;
var pips = new Seq();
function triggerPip(x,y,s,m){
	var trgg = false;
	pips.each(t =>{
		if(trgg){return;}
		if(t.retrigger(x,y,s,m)){
			trgg = true;
		}
	});
	if(!trgg){
		var pip = alertPip.new(x,y);
		pip.severity=s;
		pips.add(pip);
	}
	pips.sort(floatf(p=>p.severity));
}
var alertPip = {
	x:0,
	y:0,
	severity:0,
	shake:5,
	animate:0,
	life:0,
	maxlife:500,
	points:null,
	transition:0,
	px:0,
	py:0,
	pang:0,
	new(x,y){
		var newpip = Object.create(alertPip);
		newpip.x=x;
		newpip.y=y;
		newpip.points = Seq.with(new Vec2(x,y));
		return newpip;
	},
	draw(){
		this.life++;
		this.maxlife= (Math.min(3000,500+this.severity*500));
		let fade = Mathf.clamp((this.maxlife-this.life)*0.01,0,1);
		if(!showpips){
			return;
		}
		
		this.shake/=1.4;
		var camera = Core.camera;
		
		
		let col = Pal.accent;
		let icon = (this.severity<2?alerticonlow:alerticonhigh);
		if(this.severity<1){
			col = Pal.accent.cpy().lerp(Pal.health,this.severity);
		}else if(this.severity<3){
			col = Pal.health;
		}else{
			col = (Time.time%60<30 ? Pal.health: Color.white);
		}
		
		let camdist = Mathf.dst(this.x, this.y,camera.position.x,camera.position.y);
		let size = Math.max(0.5,1.0/(1.0+0.002*camdist));
		this.animate+=(size-this.animate)*0.1;
		if(inCamera(camera,this.x,this.y) && camdist<80){
			if(this.transition>=1){
				this.px=this.x;
				this.py=this.y+8;
				this.pang=270;
			}else{
				this.transition = Mathf.clamp(this.transition+0.05,0,1);
				this.px+=(this.x-this.px)*0.2;
				this.py+=(this.y+8-this.py)*0.2;
				this.pang+=(270-this.pang)*0.2;
				
			}
			
			Draw.color(col);
			Draw.alpha(0.5);
			this.points.each(p =>{
				Lines.line(this.px,this.py-8,p.x,p.y);
			});
			
		}else{
			let dx = this.x - camera.position.x;
			let dy = this.y - camera.position.y;
			dx/=camdist;
			dy/=camdist;
			if(this.transition<=0){
				this.pang = Mathf.atan2(dx, dy) * Mathf.radiansToDegrees;
				this.px = camera.position.x + dx*20;
				this.py = camera.position.y + dy*20;
			}else{
				this.transition = Mathf.clamp(this.transition-0.05,0,1);
				this.px+=(camera.position.x + dx*20-this.px)*0.3;
				this.py+=(camera.position.y + dy*20-this.py)*0.3;
				this.pang+=( Mathf.atan2(dx, dy) * Mathf.radiansToDegrees-this.pang)*0.3;
			}
			
		}
		Draw.color(Pal.darkerGray);
		Fill.circle(this.px,this.py,(22/4)*this.animate);
		
		Draw.color(col);
		Draw.alpha(fade);
		
		Draw.rect(pipicon,this.px,this.py,12*this.animate,12*this.animate,this.pang);
		Draw.rect(icon, this.px + Mathf.range(this.shake),this.py+ Mathf.range(this.shake),4*this.animate,4*this.animate);
			
	},
	retrigger(x,y,s,max){
		if(Mathf.dst2(x-this.x,y-this.y)<(100*100)){
			if(this.severity<max){
				this.severity+=s;
				this.severity = Math.min(max,this.severity);
				this.life=0;
			}
			this.shake = 5;
			this.life*=0.8;
			this.points.add(new Vec2(x,y));
			return true;
		}
		return false;
	}
}


var unitprogressbar = {
	replace:false,
	draw(build){
		if(build.currentPlan == -1){
			return;
		}
		
		var prog = 0;
		if(build instanceof UnitFactory.UnitFactoryBuild){
			var plan = build.block.plans.get(build.currentPlan);
			prog = build.progress / plan.time;
		}else{
			prog = build.progress / build.block.constructTime;
		}
		if(prog>0 && viewprogress){
			var hw = build.block.size*4;
			var yoffset = hw + 2;
			
			Draw.z(Layer.darkness+1);
			
			Draw.color(Pal.darkerGray);
			Lines.stroke(4);
			Lines.line(build.x - hw,build.y+yoffset,build.x - hw +hw*2*prog,build.y+yoffset);
			Draw.color(build.team.color);
			Lines.stroke(2);
			Lines.line(build.x - hw,build.y+yoffset,build.x - hw +hw*2*prog,build.y+yoffset);
			
			var text = Math.floor(prog*100.0)+"%";
			
			var font = Fonts.outline;
			var lay = Pools.obtain(GlyphLayout, prov(()=>{return new GlyphLayout()}));
			
			font.setUseIntegerPositions(false);
			font.getData().setScale(1.0 / 4.0 / Scl.scl(1.0));
			
			lay.setText(font, text);

			font.setColor(Color.white);
			font.draw(text, build.x - lay.width / 2, build.y + yoffset + lay.height / 2 + 6);
			font.getData().setScale(1);
			Pools.free(lay);
			Draw.reset();
		}
		
	}
}



var inConstruction = new Seq();

var queue = new Seq();
var prefix = "/t";
var prevsent = 0;
var enabled = false;

Events.on(EventType.BlockDestroyEvent, cons(e => {
	var tile = e.tile;
	if(tile.build instanceof CoreBlock.CoreBuild){
		if(tile.team()== Vars.player.team()){
			queue.add("[red]!!Core at ["+tile.x+","+tile.y+"] was lost!!");
		}else{
			eventLogInfo(tile.team(),"has lost a core at ["+tile.x+","+tile.y+"]");
		}
	}
	if(tile.team()== Vars.player.team()){
		var severe = 0.01;
		var max = 0.5;
		if(tile.build.block.category==Category.distribution){
			severe*=1;
		}
		if(tile.build.block.category==Category.defense){
			severe*=5*tile.build.block.size;
			max = 1.5;
		}
		if(tile.build.block.category==Category.turret){
			severe*=10*tile.build.block.size;
			max = 2.5;
		}
		if(tile.build.block.category==Category.power){
			max = tile.build.block.size*2;
			if(tile.build.block instanceof PowerGenerator){
				severe*=150;
			}else 
			if(tile.build.block instanceof PowerNode){
				severe*=3;
			}else{
				severe*=50;
			}
		}
		if(tile.build.block.category==Category.logic){
			severe*=10;
		}
		if(tile.build.block.category==Category.production){
			severe*=(tile.build.block.size==2?3:30);
			max = tile.build.block.size*2;
		}
		if(tile.build.block.category==Category.crafting){
			severe*=30;
			max = tile.build.block.size*2;
		}
		if(tile.build.block.category==Category.units){
			severe*=200;
			max = 5;
		}
		if(tile.build.block.category==Category.effect){
			severe*=5;
			max = 1;
		}
		triggerPip(tile.getX(),tile.getY(),severe,max);
	}
}));
var anticommandspam = new Seq();;
Events.on(EventType.CommandIssueEvent, cons(e => {
	var tile = e.tile;
	if(tile.team!== Vars.player.team() && e.command == UnitCommand.attack){
		//remove any attack commands in the last 10 seconds.
		anticommandspam.each(t =>{
			if(t.team == tile.team){
				t.timer=-1;
			}
		});
		
		anticommandspam.add({
			timer: 0,
			team: tile.team
		});
		
	}
}));

Events.on(EventType.ClientLoadEvent, 
cons(e => {
	alerticonlow = Core.atlas.find("pvpnotifs-alert-0");
	alerticonhigh = Core.atlas.find("pvpnotifs-alert-1");
	pipicon = Core.atlas.find("pvpnotifs-pip");
	addTrackHandler(BlockTrackHandler.new("graphite",BlockBuildTracker, Blocks.graphitePress,false,{
		"customText": function(team,block,tile){
			return "has started graphite production "+toBlockEmoji(block)+""+toBlockEmoji(Items.graphite);
		}
	} ));
	addTrackHandler(BlockTrackHandler.new("silicon",BlockBuildTracker, Blocks.siliconSmelter,false,{
		"customText": function(team,block,tile){
			return "has started silicon production "+toBlockEmoji(block)+""+toBlockEmoji(Items.silicon);
		}
	}));
	addTrackHandler(BlockTrackHandler.new("plast",BlockBuildTracker, Blocks.plastaniumCompressor,false,{
		"customText": function(team,block,tile){
			return "has started plastanium production "+toBlockEmoji(block)+""+toBlockEmoji(Items.plastanium);
		}
	}));
	addTrackHandler(BlockTrackHandler.new("phase",BlockBuildTracker, Blocks.phaseWeaver,false,{
		"customText": function(team,block,tile){
			return "has started phase production "+toBlockEmoji(block)+""+toBlockEmoji(Items.phaseFabric);
		}
	}));
	addTrackHandler(BlockTrackHandler.new("surge",BlockBuildTracker, Blocks.surgeSmelter,false,{
		"customText": function(team,block,tile){
			return "has started surge production "+toBlockEmoji(block)+""+toBlockEmoji(Items.surgeAlloy);
		}
	}));
	addTrackHandler(BlockTrackHandler.new("foreshadow",BlockBuildTracker, Blocks.foreshadow,false,{}));
	
	
	
	
	
	Vars.content.blocks().each((e2)=>{
		if(e2 instanceof UnitFactory){ 
			addTrackHandler(BlockTrackHandler.new(e2.name,BlockBuildTracker, e2,false,{}));
			e2.buildType = ()=>{  
				return extend(UnitFactory.UnitFactoryBuild,e2,{
					drawables:[
						Object.create(unitprogressbar)
					],
					draw(){
						var replaced = false;
						for(let i = 0;i<this.drawables.length;i++){
							if(this.drawables[i].replace){
								replaced = true;
								break;
							}
						}
						if(!replaced){
							this.super$draw();
						}
						for(let i = 0;i<this.drawables.length;i++){
							this.drawables[i].draw(this);
						}
					}
					
				});
			}
		}
		if(e2 instanceof Reconstructor){
			addTrackHandler(BlockTrackHandler.new(e2.name,BlockBuildTracker, e2,false,{
				"customText": function(team,block,tile){
					return "can now make Tier-"+Math.round((block.size+1)*0.5)+" units" + toBlockEmoji(block);
				}
			}));
			
			e2.buildType = ()=>{ 
				return extend(Reconstructor.ReconstructorBuild,e2,{
					drawables:[
						Object.create(unitprogressbar)
					],
					draw(){
						var replaced = false;
						for(let i = 0;i<this.drawables.length;i++){
							if(this.drawables[i].replace){
								replaced = true;
								break;
							}
						}
						if(!replaced){
							this.super$draw();
						}
						for(let i = 0;i<this.drawables.length;i++){
							this.drawables[i].draw(this);
						}
					}
					
				});
			}
		}
	});
	var titaniumevent = {
		"customText": function(team,block,tile){
			return "has started titanium production "+toBlockEmoji(block)+""+toBlockEmoji(Items.titanium);
		},
		"buildfilter":function(build){
			return build.dominantItem == Items.titanium;
		}
	};
	var thoriumevent = {
		"customText": function(team,block,tile){
			return "has started thorium production "+toBlockEmoji(block)+""+toBlockEmoji(Items.thorium);
		},
		"buildfilter":function(build){
			return build.dominantItem == Items.thorium;
		}
	};
	addTrackHandler(BlockTrackHandler.new("titanium",BlockBuildTracker, Blocks.pneumaticDrill,false,titaniumevent));
	addTrackHandler(BlockTrackHandler.new("titanium",BlockBuildTracker, Blocks.laserDrill,false,titaniumevent));
	addTrackHandler(BlockTrackHandler.new("titanium",BlockBuildTracker, Blocks.blastDrill,false,titaniumevent));
	addTrackHandler(BlockTrackHandler.new("thorium",BlockBuildTracker, Blocks.laserDrill,false,thoriumevent));
	addTrackHandler(BlockTrackHandler.new("thorium",BlockBuildTracker, Blocks.blastDrill,false,thoriumevent));
	
	/* - unforuntaly doesnt work and makes the messages not appear.(the ui element is still there thoh)
	Vars.ui.chatfrag = extend(	ChatFragment,{
		container2:null,
		addMessage(message,sender){
			this.super$addMessage(message,sender);
			onChat(sender,message);
		},
		container(){
			if(!this.container2){
				let th = this;
				this.container2 = extend(Fragment,{
					build(parent){
						Core.scene.add(th);
					}
				});
			}
			return this.container2;
		}
	});*/
	
	
	Vars.mods.getScripts().runConsole("this.alert = this.global.alerts.onChat");
	//onChat("Xelo",msg)
	var rangeicon = Core.atlas.find("pvpnotifs-rangeair");
	var rangeicon2 = Core.atlas.find("pvpnotifs-rangeground");
	var rangeammoicon = Core.atlas.find("pvpnotifs-rangeammo");
	var progressicon = Core.atlas.find("pvpnotifs-unitprogress");
	var oreicon = Core.atlas.find("pvpnotifs-orescan");
	var votekick = Core.atlas.find("pvpnotifs-votekick");
	var pipbuttonicon = Core.atlas.find("pvpnotifs-pipicon");
	
	//Vars.indexer.getAllied(team, BlockFlag.generator).forEach((c)=>{});
	
	var coreplus = (t)=>{
		t.row();
		t.getCells().get(0).padBottom(6);
		//prov(()=>{return "Power:"+Strings.fixed(powerBalance()*60.0,1)})
		//prov(()=>{return Pal.health.cpy().lerp(Color.lime, Math.clamp(powerBalance()*0.25+0.5,0,1))})
		var powbar= new Bar("Power",Pal.accent, floatp(()=>{return getBatLevel();}));
		powbar.set(prov(()=>{return "Power: "+(powerBalance() >= 0 ? "+" : "") + Strings.fixed(powerBalance()*60.0,1)}),floatp(()=>{return getBatLevel();}),Pal.accent);
		t.add(powbar).width(200).height(25).pad(4);
	}
	coreplus(Vars.ui.hudGroup.find("coreitems"));
	
	
	var custominfo = extend(BaseDialog,"",{
        showSchem(schem){
			this.setFillParent(true);
			if(this.buttons.getCells().isEmpty()){
				this.addCloseButton();
			}
            this.cont.clear();
            this.title.setText("[[" + Core.bundle.get("schematic") + "] " +schem.name());

            this.cont.add(Core.bundle.format("schematic.info", schem.width, schem.height, schem.tiles.size)).color(Color.lightGray);
            this.cont.row();
            this.cont.add(new SchematicsDialog.SchematicImage(schem)).maxSize(800);
            this.cont.row();

            var arr = schem.requirements();
            this.cont.table(cons(r => {
                var i = 0;
  							arr.each((item,amount)=>{
  									r.image(item.icon(Cicon.small)).left();
                    r.label(() => {
                        var core = Vars.player.core();
                        if(core == null || Vars.state.rules.infiniteResources || core.items.has(item, amount)) return "[lightgray]" + amount + "";
                        return (core.items.has(item, amount) ? "[lightgray]" : "[scarlet]") + Math.min(core.items.get(item), amount) + "[lightgray]/" + amount;
                    }).padLeft(2).left().padRight(4);

                    if(++i % 4 == 0){
                        r.row();
                    }
								});
            }));
            this.cont.row();
            var consump = schem.powerConsumption() * 60;
						var prod = schem.powerProduction() * 60;
            if(!Mathf.zero(consump) || !Mathf.zero(prod)){
                this.cont.table(cons(t => {

                    if(!Mathf.zero(prod)){
                        t.image(Icon.powerSmall).color(Pal.powerLight).padRight(3);
                        t.add("+" + Strings.autoFixed(prod, 2)).color(Pal.powerLight).left();

                        if(!Mathf.zero(consump)){
                            t.add().width(15);
                        }
                    }

                    if(!Mathf.zero(consump)){
                        t.image(Icon.powerSmall).color(Pal.remove).padRight(3);
                        t.add("-" + Strings.autoFixed(consump, 2)).color(Pal.remove).left();
                    }
                }));
            }
				
			this.cont.row();
			this.cont.table(
				cons((tbl)=>{
					for(let i =0;i<10;i++){
						const g = i;
						tbl.button(Icon.paste, Styles.clearToggleTransi, run(()=>{
							log(g+" setting")
							Core.settings.put(g+"-schem",new java.lang.String(schem.name()));
						})).update(b => b.setChecked(Core.settings.getString(g+"-schem")==schem.name())).width(46).height(46).name("test"+1).tooltip("set to slot "+g);
					}
				})
			);	
            this.show();
        }
    });
	
	
	Vars.ui.schematics = extend(SchematicsDialog,{
		showInfo(schem){
			custominfo.showSchem(schem);
		}
	});
	
	Vars.ui.hudGroup.fill(cons(t => {
		let togglestyle = Styles.clearToggleTransi;
		let style = Styles.clearTransi;
		t.button(new TextureRegionDrawable(rangeicon), togglestyle, run(()=>{
			viewAirRange=!viewAirRange;
		})).update(b => b.setChecked(viewAirRange)).width(46).height(46).name("airrange").tooltip("view air turret range");
		
		t.button(new TextureRegionDrawable(rangeicon2), togglestyle, run(()=>{
			viewGroundRange=!viewGroundRange;
		})).update(b => b.setChecked(viewGroundRange)).width(46).height(46).name("groundrange").tooltip("view ground turret range");
		
		t.button(new TextureRegionDrawable(rangeammoicon), togglestyle, run(()=>{
			ignoreNoAmmo=!ignoreNoAmmo;
		})).update(b => b.setChecked(ignoreNoAmmo)).width(46).height(46).name("ammorange").tooltip("ignore turrets without ammo");
		
		t.row();
		t.button(Icon.units, style, run(()=>{
			onChat("Xelo","units")
		})).width(46).height(46).name("units").tooltip("count enemy units");
		
		t.button(new TextureRegionDrawable(progressicon), togglestyle, run(()=>{
			viewprogress=!viewprogress;
		})).update(b => b.setChecked(viewprogress)).width(46).height(46).name("progress").tooltip("show progress bar on unit factories");
		
		t.button(Icon.units, togglestyle, run(()=>{
			stealUnit=!stealUnit;
		})).update(b => b.setChecked(stealUnit)).width(46).height(46).name("stealunit").tooltip("control nearby unit as soon as it exits factory");
		
		t.row();
		t.button(new TextureRegionDrawable(oreicon), togglestyle, run(()=>{
			orescan=!orescan;
		})).update(b => b.setChecked(orescan)).width(46).height(46).name("ores").tooltip("show covered ores");
		t.button(Icon.eyeSmall, togglestyle, run(()=>{
			Vars.enableLight=!Vars.enableLight;
		})).update(b => b.setChecked(orescan)).width(46).height(46).name("light").tooltip("toggle lighting");
		t.button(new TextureRegionDrawable(pipbuttonicon), togglestyle, run(()=>{
			showpips=!showpips;
		})).update(b => b.setChecked(showpips)).width(46).height(46).name("light").tooltip("show pips");
		t.row();
		t.button(Icon.refresh, style, run(()=>{
			Call.sendChatMessage("/sync");
		})).width(46).height(46).name("ores").tooltip("sync");
		t.button(new TextureRegionDrawable(votekick), style, run(()=>{
			Call.sendChatMessage("/vote y");
		})).width(46).height(46).name("ores").tooltip("vote y");
		
		t.button(Icon.terminal, togglestyle, run(()=>{
			if(playerAI){
				playerAI = null;
			}else{
				playerAI = new BuilderAI();
				playerAI.unit(Vars.player.unit());
			}
		})).update(b => b.setChecked(!!playerAI)).width(46).height(46).name("ores").tooltip("become gamma Ai");
		
		t.top().right().marginTop(180);
		//Icon.units
	}));
	Vars.ui.hudGroup.fill(cons(t => {
		let style = Styles.clearTransi;
		const width = 46*3/5;
		for(let h = 0;h<10;h++){
			const i = h;
			if(h==5){
				t.row();
			}
			let imgbutton = t.button(Icon.paste, style, run(()=>{
				useSchematic(Core.settings.getString(i+"-schem"));
			})).update(b => b.setDisabled(!Core.settings.getString(i+"-schem"))).width(width).height(width).name("ores").tooltip("use Schem "+i).get();
			imgbutton.getImage().setScaling(Scaling.stretch);
			imgbutton.getImage().setSize(width*0.8,width*0.8);
			imgbutton.resizeImage(width*0.8);
			
		}
		t.top().right().marginTop(364);
	}));
	
}));

function useSchematic(name){
	if(!name){return;}
	print("searching for schem:"+name);
	var found = null;
	Vars.schematics.all().each((s)=>{
		if(s.name()==name){
			print("found schem");
			found = s;
		}
	});
	if(found){
		Vars.control.input.useSchematic(found);
	}
}

var playerMiningAI= extend(AIController,{
	mining:true,
	targetItem:null,
	ore:null,
	unitS(u){
		if(this.unit == u) return;
        this.unit = u;
        this.init();
	},
	updateMovement(){
		let unit = this.unit;
		
        var core = unit.closestCore(); //core is a Building

        if(!(unit.canMine()) || core == null) return;

        if(unit.mineTile != null && !unit.mineTile.within(unit, unit.type.range)){
            unit.mineTile=null;
        }

        if(this.mining){
            if(this.timer.get(1, 240) || this.targetItem == null){
                this.targetItem = unit.team.data().mineItems.min(boolf(i => Vars.indexer.hasOre(i) && unit.canMine(i)),floatf(i => core.items.get(i)));
            }

            //core full of the target item, do nothing
            if(this.targetItem != null && core.acceptStack(this.targetItem, 1, unit) == 0){
                unit.clearItem();
                unit.mineTile=null;
                return;
            }
			//custom player mining ai: todo
            //if inventory is full, drop it off.
            if(unit.stack.amount >= unit.type.itemCapacity || (this.targetItem != null && !unit.acceptsItem(this.targetItem))){
                this.mining = false;
            }else{
                if(this.targetItem != null){
                    this.ore = Vars.indexer.findClosestOre(core.x,core.y, this.targetItem);
                }

                if(this.ore != null){
                    this.moveTo(this.ore, unit.type.range / 4, 20);

                    if(unit.within(this.ore, unit.type.range*0.5)){
                        unit.mineTile = this.ore;
                    }

                    if(this.ore.block() != Blocks.air){
                        this.mining = false;
                    }
                }
            }
        }else{
            unit.mineTile = null;

            if(unit.stack.amount == 0){
                this.mining = true;
                this.return;
            }

            if(unit.within(core, unit.type.range)){
                if(core.acceptStack(unit.stack.item, unit.stack.amount, unit) > 0){
					Call.transferInventory(Vars.player,core);
                    //Call.transferItemTo(unit, unit.stack.item, unit.stack.amount, unit.x, unit.y, core);
                }

                //unit.clearItem();
                this.mining = true;
            }

            this.circle(core, unit.type.range / 1.8);
        }
    }
});


var playerAI = null;

var powerbal=0;
var stored=0;
var battery=0.01;
function powerBalance(){
	return powerbal;
}
function getBatLevel(){
	return stored/battery;
}

var viewAirRange=false;
var viewGroundRange=false;
var ignoreNoAmmo=false;
var viewprogress= true;
var orescan= false;
var showpips = true;


function eachIndexed(team,flag,cons){
	let iter = Vars.indexer.getAllied(team,flag).iterator();
	while(iter.hasNext()){
		cons.get(iter.next());
	}
}
function hasAmmo(build){
	
	if(build.block instanceof PowerTurret || build.block instanceof PointDefenseTurret || build.block instanceof TractorBeamTurret){
		return build.power.status>0;
	}
	if(build.block instanceof Turret){
		return build.hasAmmo();
	}
	return false;
}

Events.run(Trigger.draw, () => {
	var camera = Core.camera;
	var avgx = Math.floor(camera.position.x / Vars.tilesize);
	var avgy = Math.floor(camera.position.y / Vars.tilesize);
	var rangex = Math.floor(camera.width / Vars.tilesize / 2) + 3;
	var rangey = Math.floor(camera.height / Vars.tilesize / 2) + 3;
	
	if(viewAirRange||viewGroundRange){
		Draw.draw(Layer.darkness+0.01, run(()=>{
			var expandr = 2;
			var minx = Math.max(avgx - rangex - expandr, 0);
			var miny = Math.max(avgy - rangey - expandr, 0);
			var maxx = Math.min(Vars.world.width() - 1, avgx + rangex + expandr);
			var maxy = Math.min(Vars.world.height() - 1, avgy + rangey + expandr);
			
			Draw.color(0,0,0,0.3);
			Fill.rect(camera.position.x,camera.position.y,camera.width,camera.height);
			allTeams.each((team)=>{
				eachIndexed(team,BlockFlag.turret, cons((tile)=>{
					if(!tile.build){
						return;
					}
					let bx = Mathf.clamp(tile.x,minx,maxx);
					let by = Mathf.clamp(tile.y,miny,maxy);
					if(!(hasAmmo(tile.build)||!ignoreNoAmmo)){
						return;
					}
					let rdist = Mathf.dst(bx,by,tile.x,tile.y)*8- 40;
					var tb = tile.build;
					if(((viewAirRange&&tb.block.targetAir)||(viewGroundRange&&tb.block.targetGround)) && rdist< tb.block.range){
						Draw.color(tile.team().color,0.05);
						Fill.circle(tb.x, tb.y, tb.block.range);
						Draw.color(tile.team().color,0.3);
						Lines.circle(tb.x, tb.y, tb.block.range);
					}
					
				}));
			});
		}));
	}
	if(orescan){
		Draw.draw(Layer.block+0.01, run(()=>{
			var minx = Math.max(avgx - rangex - 1, 0);
			var miny = Math.max(avgy - rangey - 1, 0);
			var maxx = Math.min(Vars.world.width() - 1, avgx + rangex + 1);
			var maxy = Math.min(Vars.world.height() - 1, avgy + rangey + 1);
			
			for(var x = minx; x <= maxx; x++){
				for(var y = miny; y <= maxy; y++){
					var tile = Vars.world.rawTile(x,y);
					if(!tile.build){
						continue;
					}
					var tb = tile.drop();
					if(tb){
						Draw.rect(tb.icon(Cicon.small),tile.drawx(),tile.drawy());
					}
				}
			}
		}));
	}
	Draw.draw(Layer.overlayUI+0.01, run(()=>{
		pips.each(t =>{
			t.draw();
		});
	}));
});


function iterateOver(iterator,func){
	while(iterator.hasNext()) {
		func(iterator.next());
	}
}


var glitch = false;
var delayglitch=0;
Events.run(Trigger.update, () => {
	
	pips.filter((t)=>{
		return t.life<t.maxlife;
	});
	
	anticommandspam.filter((t)=>{
		return t.timer>=0;
	});
	anticommandspam.each(t =>{
		t.timer+=Time.delta;
		if(t.timer>600){
			eventLogInfo(t.team,"has issued command to attack.");
			t.timer=-1;
		}
	});
	if(playerAI && Vars.player.unit() && Vars.player.unit().type){
		let base = Math.min(Vars.player.team().items().get(Items.copper),Vars.player.team().items().get(Items.lead));
		if((base<1000 && playerAI instanceof BuilderAI)||  Vars.player.unit().type.buildSpeed<=0){
			playerAI = playerMiningAI;
		}else if(base>=1000 && playerAI == playerMiningAI){
			playerAI = new BuilderAI();
		}
		if(playerAI==playerMiningAI){
			playerAI.unitS(Vars.player.unit());
		}else{
			playerAI.unit(Vars.player.unit());
		}
		playerAI.updateUnit();
	}
	
	if(wasCleared){
		var be = enabled;
		enabled = false;
		update();
		while(!queue.isEmpty()){
			Vars.ui.chatfrag.addMessage(queue.pop(),"[red]PvP-Alerts");
		}
		enabled = be;
		wasCleared = false;
	}
	for(var i=0;i<scanningUnits.size;i++){
		if(scanningUnits.get(i).x!=0){
			var unit = scanningUnits.get(i);
			if(Vars.player.unit() && stealUnit && !lookingForUnit){
				print("attmpting steal");
				var dist = Mathf.dst(Vars.player.unit().x,Vars.player.unit().y,unit.x,unit.y);
				if(dist<100){
					queue.add("[green]Attempting to grab a "+unit.type.localizedName+"...")
					lookingForUnit=unit.type;
				}else{
					print(unit+" spawned too far ("+(dist/8)+" blocks away)");
					print(Vars.player.unit().x+","+Vars.player.unit().y+"|"+unit.x+","+unit.y);
				}
			}
			scanningUnits.remove(i);
		}
	}
	
	
	
	
	if(lookingForUnit){
		Groups.unit.each(cons((e)=>{
			if(e.isAI() && e.team == Vars.player.team() && !e.dead && e.type==lookingForUnit){
				stealUnit=false;
				lookingForUnit=null;
				Call.unitControl(Vars.player,e);
			}
		}));
	}
	if(glitch){
		let mv = Vars.control.input.movement;
		if(mv.len()>0.1 && delayglitch>20){
			Vars.netClient.setPosition(Vars.player.unit().x+mv.x*10,Vars.player.unit().y+mv.y*10);
			delayglitch=0;
		}
	}
	delayglitch++;
	
	
	update();
	
	var gridSeq = new Seq();
	
	battery=0.01;
	stored=0;
	powerbal=0;
	let tilecons = (c)=>{
		if(!c.build || !c.build.power){return;}
		let graph = c.build.power.graph;
		if(!gridSeq.contains(graph)){
			gridSeq.add(graph);
			stored+=graph.getBatteryStored();
			battery+=graph.getTotalBatteryCapacity();
			powerbal+=graph.getPowerBalance();
		}
	};
	iterateOver(Vars.indexer.getAllied(Vars.player.team(), BlockFlag.generator).iterator(),tilecons);
	iterateOver(Vars.indexer.getAllied(Vars.player.team(), BlockFlag.reactor).iterator(),tilecons);
	//Vars.control.input.useSchematic(Vars.schematics.all().get(5))
});

var prevmap="";

Events.on(EventType.WorldLoadEvent, e => {
	if(Vars.state.map.name()!= prevmap){
		clear();
		prevmap=Vars.state.map.name();
		pips.clear();
	}
});

function update(){
	if(!queue.isEmpty()){
		if(enabled){
			if(prevsent>120){
				Call.sendChatMessage(prefix+" "+queue.pop());
				prevsent=0;
			}
		}else{
			Vars.ui.chatfrag.addMessage(queue.pop(),"[red]PvP-Alerts");
		}
		
	}	
	prevsent +=Time.delta;
	
	trackers.each((t)=>{
		t.updateTrack();
	})
	trackers.filter((t)=>{
		return !t.done;
	});
	
	
}
var wasCleared =false;
var allTeams = new Seq();

function clear(){
	anticommandspam.clear();
	eventid = 0;
	queue.clear();
	trackers.clear();
	allTeams.clear();
	if(teams){
		teams.clear();
	}
	log("debug","cleared all.");
	
	Vars.world.tiles.each((x,y)=>{
		var tile = Vars.world.tile(x,y);
		if(tile.team()!==Team.derelict){
			if(tile.team()!==Vars.player.team() && tile.team().core()){
				blocktrackhandle.each((k,v)=>{
					v.processBuildingEvent(tile.team(),tile);
				});
			}
			if(!allTeams.contains(tile.team())){
				allTeams.add(tile.team());
			}
		}
	});
	wasCleared = true;
	
}

Events.on(EventType.BlockBuildBeginEvent, e => {
	var team = e.team;
	if(!e.breaking && e.team!=Vars.player.team()){
		getTeamAch(e.team).processBuildingEvent(e.tile);
		if(blocktrackhandle){
			blocktrackhandle.each((k,v)=>{
				v.processBuildingEvent(team,e.tile);
			})
		}
	}
	if(!allTeams.contains(team)){
		allTeams.add(team);
	}
});


var stealUnit=true;
var scanningUnits=new Seq();
var lookingForUnit=null;
Events.on(EventType.UnitCreateEvent, e => {
	print(e.unit.type);
	var team = e.unit.team;
	if(team!=Vars.player.team()){
		getTeamAch(team).processUnitCreateEvent(e.unit.type);
	}
	scanningUnits.add(e.unit);
	
	
	//
});



const onChat = function(sender,message) {
	if(sender&&sender.includes("Xelo")&&message){
		var all = message.split(" ");
		var cmd = all[0];
		switch(cmd){
			case "help":
				print("[red]PvP-Alerts [white]commands: [green]enable, disable, wipe, items, units, prefix");
			break;
			case "enable":
				enabled = true;
				print("[green]PvP-Alerts enabled");
			break;
			case "disable":
				enabled = false;
				print("[red]Disabled PvP-alerts"); 
			break;
			case "prefix":
				prefix = all[1];
				print("[cyan]Changed prefix to:[white]"+prefix); 
			break;
			case "wipe":
				clear();
			break;
			case "items":
				if(teams){
					
					teams.each((k,v)=>{
						var f = "";
						k.items().each((item,amount)=>{
							f+=toBlockEmoji(item)+":"+amount+","
						});
						if(f.length==0){
							return;
						}
						f = "Team "+chatTeamColor(k)+k.name+"[white]'s items:"+f;
						queue.add(f);
					});
					queue.add("[cyan]Scanning enemy core items..");
				}
			break;
			case "glitch":
				glitch=!glitch;
			break;
			case "units":
				if(teams){
					
					allTeams.each((team,achieve)=>{
						var units = null;
						team.data().units.each((unit)=>{
							if(!unit.type.isCounted){
								return;
							}
							if(!units){
								units= ObjectMap.of(unit.type,{count:0});
							}
							if(!units.get(unit.type)){
								units.put(unit.type,{count:0});
							}
							units.get(unit.type).count++;
						});
						var f = (Vars.player.team() == team? "Your team":"Team "+chatTeamColor(team)+team.name+"[white]");
						if(!units){
							f += "[white] has no units currently";
						}else{
							let uf = "";
							units.each((type,countobj)=>{
								uf+=toBlockEmoji(type)+":"+countobj.count+", "
							});
							f += "[white]'s units:"+uf;
						}
						queue.add(f);
					});
					queue.add("[cyan]Counting enemy units..");
				}
			break;
		}
	}
};

global.alerts.onChat = function(msg){onChat("Xelo",msg);};





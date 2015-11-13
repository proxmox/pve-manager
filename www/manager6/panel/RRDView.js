Ext.define('PVE.panel.RRDView', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveRRDView',

    initComponent : function() {
	var me = this;

	if (!me.datasource) {
	    throw "no datasource specified";
	}

	if (!me.rrdurl) {
	    throw "no rrdurl specified";
	}

	var stateid = 'pveRRDTypeSelection';
	var sp = Ext.state.Manager.getProvider();
	var stateinit = sp.get(stateid);

        if (stateinit) {
	    if(stateinit.timeframe !== me.timeframe || stateinit.cf !== me.rrdcffn){
		me.timeframe = stateinit.timeframe;
		me.rrdcffn = stateinit.cf;
	    }
	}

	if (!me.timeframe) {
	    if(stateinit && stateinit.timeframe){
		me.timeframe = stateinit.timeframe;
	    }else{
		me.timeframe = 'hour';
	    }
	}

	if (!me.rrdcffn) {
	    if(stateinit && stateinit.rrdcffn){
		me.rrdcffn = stateinit.cf;
	    }else{
		me.rrdcffn = 'AVERAGE';
	    }
	}


	var datasource = me.datasource;

	// fixme: dcindex??
	var dcindex = 0;
	var create_url = function() {
	    var url = me.rrdurl + "?ds=" + datasource + 
		"&timeframe=" + me.timeframe + "&cf=" + me.rrdcffn +
		"&_dc=" + dcindex.toString();
	    dcindex++;
	    return url;
	};


	Ext.apply(me, {
	    layout: 'fit',
	    html: {
		tag: 'img',
		width: 800,
		height: 200,
		src:  create_url()
	    },
	    applyState : function(state) {
		if (state && state.id) {
		    if(state.timeframe !== me.timeframe || state.cf !== me.rrdcffn){
		        me.timeframe = state.timeframe;
		        me.rrdcffn = state.cf;
		        me.reload_task.delay(10);
		    }
		}
	    }
	});
	
	me.callParent();
   
	me.reload_task = new Ext.util.DelayedTask(function() {
	    if (me.rendered) {
		try {
		    var html = {
			tag: 'img',
			width: 800,
			height: 200,
			src:  create_url()
		    };
		    me.update(html);
		} catch (e) {
		    // fixme:
		    console.log(e);
		}
		me.reload_task.delay(30000);
	    } else {
		me.reload_task.delay(1000);
	    }
	});

	me.reload_task.delay(30000);

	me.on('destroy', function() {
	    me.reload_task.cancel();
	});

	var state_change_fn = function(prov, key, value) {
	    if (key == stateid) {
		me.applyState(value);
	    }
	};

	me.mon(sp, 'statechange', state_change_fn);
    }
});

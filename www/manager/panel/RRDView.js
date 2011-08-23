Ext.define('PVE.panel.RRDView', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveRRDView',

    initComponent : function() {
	var me = this;

	if (!me.timeframe) {
	    me.timeframe = 'hour';
	}

	if (!me.rrdcffn) {
	    me.rrdcffn = 'AVERAGE';
	}

	if (!me.datasource) {
	    throw "no datasource specified";
	}

	if (!me.rrdurl) {
	    throw "no rrdurl specified";
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

	var stateid = 'pveRRDTypeSelection';

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
		    me.timeframe = state.timeframe;
		    me.rrdcffn = state.cf;
		    me.reload_task.delay(10);
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

	var sp = Ext.state.Manager.getProvider();
	me.applyState(sp.get(stateid));

	var state_change_fn = function(prov, key, value) {
	    if (key == stateid) {
		me.applyState(value);
	    }
	};

	me.mon(sp, 'statechange', state_change_fn);
    }
});

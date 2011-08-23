Ext.define('PVE.form.RRDTypeSelector', {
    extend: 'Ext.form.field.ComboBox',
    requires: [
	'Ext.state.Manager'
    ],

    alias: ['widget.pveRRDTypeSelector'],
  
    initComponent: function() {
        var me = this;
	
	var store = new Ext.data.ArrayStore({
            fields: [ 'id', 'timeframe', 'cf', 'text' ],
            data : [
		[ 'hour', 'hour', 'AVERAGE', "Hour (average)" ],
		[ 'hourmax', 'hour', 'MAX', "Hour (max)" ],
		[ 'day', 'day', 'AVERAGE', "Day (average)" ],
		[ 'daymax', 'day', 'MAX', "Day (max)" ],
		[ 'week', 'week', 'AVERAGE', "Week (average)" ],
		[ 'weekmax', 'week', 'MAX', "Week (max)" ],
		[ 'month', 'month', 'AVERAGE', "Month (average)" ],
		[ 'monthmax', 'month', 'MAX', "Month (max)" ],
		[ 'year', 'year', 'AVERAGE', "Year (average)" ],
		[ 'yearmax', 'year', 'MAX', "Year (max)" ]
	    ]
	});

	Ext.apply(me, {
            store: store,
            displayField: 'text',
	    valueField: 'id',
	    editable: false,
            queryMode: 'local',
	    value: 'hour',
	    getState: function() {
		var ind = store.findExact('id', me.getValue());
		var rec = store.getAt(ind);
		if (!rec) {
		    return;
		}
		return { 
		    id: rec.data.id,
		    timeframe: rec.data.timeframe,
		    cf: rec.data.cf
		};
	    },
	    applyState : function(state) {
		if (state && state.id) {
		    me.setValue(state.id);
		}
	    },
	    stateEvents: [ 'select' ],
	    stateful: true,
	    id: 'pveRRDTypeSelection'        
	});

	me.callParent();

	var statechange = function(sp, key, value) {
	    if (key === me.id) {
		me.applyState(value);
	    }
	};

	var sp = Ext.state.Manager.getProvider();
	me.mon(sp, 'statechange', statechange, me);
    }
});


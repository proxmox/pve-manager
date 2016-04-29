Ext.define('PVE.form.RRDTypeSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: ['widget.pveRRDTypeSelector'],

    displayField: 'text',
    valueField: 'id',
    editable: false,
    queryMode: 'local',
    value: 'hour',
    stateEvents: [ 'select' ],
    stateful: true,
    stateId: 'pveRRDTypeSelection',
    store: {
	type: 'array',
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
	},
// save current selection in the state Provider so RRDView can read it
    getState: function() {
	var ind = this.getStore().findExact('id', this.getValue());
	var rec = this.getStore().getAt(ind);
	if (!rec) {
	    return;
	}
	return {
	    id: rec.data.id,
	    timeframe: rec.data.timeframe,
	    cf: rec.data.cf
	};
    },
// set selection based on last saved state
    applyState : function(state) {
	if (state && state.id) {
	    this.setValue(state.id);
	}
    }
});


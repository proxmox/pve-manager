Ext.define('PVE.panel.InputPanel', {
    extend: 'Ext.panel.Panel',
    alias: ['widget.inputpanel'],
    listeners: {
	activate: function() {
	    // notify owning container that it should display a help button
	    if (this.onlineHelp) {
		Ext.GlobalEvents.fireEvent('pveShowHelp', this.onlineHelp);
	    }
	},
	deactivate: function() {
	    if (this.onlineHelp) {
		Ext.GlobalEvents.fireEvent('pveHideHelp', this.onlineHelp);
	    }
	}
    },
    border: false,

    // override this with an URL to a relevant chapter of the pve manual
    // setting this will display a help button in our parent panel
    onlineHelp: undefined,

    // overwrite this to modify submit data
    onGetValues: function(values) {
	return values;
    },

    getValues: function(dirtyOnly) {
	var me = this;

	if (Ext.isFunction(me.onGetValues)) {
	    dirtyOnly = false;
	}

	var values = {};

	Ext.Array.each(me.query('[isFormField]'), function(field) {
            if (!dirtyOnly || field.isDirty()) {
                PVE.Utils.assemble_field_data(values, field.getSubmitData());
	    }
	});

	return me.onGetValues(values);
    },

    setValues: function(values) {
	var me = this;

	var form = me.up('form');

        Ext.iterate(values, function(fieldId, val) {
	    var field = me.query('[isFormField][name=' + fieldId + ']')[0];
            if (field) {
		field.setValue(val);
                if (form.trackResetOnLoad) {
                    field.resetOriginalValue();
                }
            }
	});
    },

    initComponent: function() {
	var me = this;

	var items;
	
	if (me.items) {
	    me.columns = 1;
	    items = [
		{
		    columnWidth: 1,
		    layout: 'anchor',
		    items: me.items
		}
	    ];
	    me.items = undefined;
	} else if (me.column1) {
	    me.columns = 2;
	    items = [
		{
		    columnWidth: 0.5,
		    padding: '0 10 0 0',
		    layout: 'anchor',
		    items: me.column1
		},
		{
		    columnWidth: 0.5,
		    padding: '0 0 0 10',
		    layout: 'anchor',
		    items: me.column2 || [] // allow empty column
		}
	    ];
	    if (me.columnB) {
		items.push({
		    columnWidth: 1,
		    padding: '10 0 0 0',
		    layout: 'anchor',
		    items: me.columnB
		});
	    }
	} else {
	    throw "unsupported config";
	}

	if (me.useFieldContainer) {
	    Ext.apply(me, {
		layout: 'fit',
		items: Ext.apply(me.useFieldContainer, { 
		    layout: 'column',
		    defaultType: 'container',
		    items: items
		})
	    });
	} else {
	    Ext.apply(me, {
		layout: 'column',
		defaultType: 'container',
		items: items
	    });
	}
	
	me.callParent();
    }
});

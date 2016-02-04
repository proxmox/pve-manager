/*
 * ComboGrid component: a ComboBox where the dropdown menu (the
 * "Picker") is a Grid with Rows and Columns expects a listConfig
 * object with a columns property roughly based on the GridPicker from
 * https://www.sencha.com/forum/showthread.php?299909
 *
*/
Ext.define('PVE.form.ComboGrid', {
    extend: 'Ext.form.field.Picker',
    alias: ['widget.PVE.form.ComboGrid'],

    // this value is used as default value after load()
    preferredValue: undefined,
    
    // If set to `true`, allows the combo field to hold more than one
    // value at a time, and allows selecting multiple items from the
    // dropdown list.
    multiSelect: false,

    defaultPickerConfig: {
        maxHeight: 300,
        width: 400,
        scrollable: true,
        floating: true,
    },

    displayField: false,
    valueField: false,
    matchFieldWidth: false,

    createPicker: function() {
	var me = this;
        var config = Ext.applyIf({
            store: me.getStore(),
            selModel: {
                selType: 'checkboxmodel',
                mode: me.multiSelect ? 'SIMPLE' : 'SINGLE',
                showHeaderCheckbox: false // shows a selectAll checkbox, not reliable
            },
            listeners: {
                selectionchange: {
                    fn: function(grid, selectedRecords) {
                        me.setRecords(selectedRecords);
                        me.fireEvent('select', me, selectedRecords);
                    },
                    scope: me
                }
            }
        }, me.defaultPickerConfig);

        Ext.apply(config, me.listConfig);

        var grid = Ext.create('Ext.grid.Panel', config);

        // if we have value(s) in the textField, mark them as selected in the picker
        if (me.getRawValue()){
            var previousItems = [];
            Ext.Array.each(me.getRawValue().split(','), function(record) {
                var previousItem = me.store.findRecord(me.valueField, record);
                // select only what can be found in the ComboGrid store
                previousItem != null && previousItems.push(previousItem);
            });

            grid.getSelectionModel().select(previousItems);

        }

        return grid;
    },

    setRecords: function(records) {
        if (records && !Ext.isArray(records)) {
            records = [records];
        }
        this.selectedRecords = records;
        var rawValue = [];

        Ext.Array.each(records, function(record) {
            rawValue.push(record.get(this.displayField));
        }, this);

        this.setValue(rawValue);
    },

    getRecords: function() {
        return this.selectedRecords;
    },

    beforeReset: function() {
        if(this.picker) {
            this.picker.getSelectionModel().deselectAll()
        }
        this.callParent(arguments);
    },

    getStore: function() {
        if (!this.store) {
            this.store = Ext.create('Ext.data.Store', {});
        }
        return this.store;
    },

    initComponent: function() {
	var me = this;
        me.callParent(arguments);

	me.store.on('beforeload', function() {	 
	    if (!me.isDisabled()) {
		me.setDisabled(true);
		me.enableAfterLoad = true;
	    }
	});

	// hack: autoSelect does not work
	me.store.on('load', function(store, r, success, o) {
	    if (success) {
		me.clearInvalid();
		
		if (me.enableAfterLoad) {
		    delete me.enableAfterLoad;
		    me.setDisabled(false);
		}

		var def = me.getValue() || me.preferredValue;
		if (def) {
		    me.setValue(def, true); // sync with grid
		}
		var found = false;
		if (def) {
		    if (Ext.isArray(def)) {
			Ext.Array.each(def, function(v) {
			    if (store.findRecord(me.valueField, v)) {
				found = true;
				return false; // break
			    }
			});
		    } else {
			found = store.findRecord(me.valueField, def);
		    }
		}

		if (!found) {
		    var rec = me.store.first();
		    if (me.autoSelect && rec && rec.data) {
			def = rec.data[me.valueField];
			me.setValue(def, true);
		    } else {
			me.setValue(me.editable ? def : '', true);
		    }
		}
	    }
	});
    }
});

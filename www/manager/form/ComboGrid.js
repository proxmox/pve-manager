Ext.define('PVE.form.ComboGrid', {
    extend: 'Ext.form.field.ComboBox',
    alias: ['widget.PVE.form.ComboGrid'],

    // this value is used as default value after load()
    preferredValue: undefined,

    computeHeight: function() {
	var me = this;
	var lh = PVE.Utils.gridLineHeigh();
	var count = me.store.getTotalCount();
	return (count > 10) ? 10*lh : 26+count*lh;
    },

    // hack: allow to select empty value
    // seems extjs does not allow that when 'editable == false'
    onKeyUp: function(e, t) {
        var me = this;
        var key = e.getKey();

        if (!me.editable && me.allowBlank && !me.multiSelect &&
	    (key == e.BACKSPACE || key == e.DELETE)) {
	    me.setValue('');
	}

        me.callParent(arguments);	
    },

    // copied from ComboBox 
    createPicker: function() {
        var me = this,
        picker,
        menuCls = Ext.baseCSSPrefix + 'menu',

        opts = Ext.apply({
            selModel: {
                mode: me.multiSelect ? 'SIMPLE' : 'SINGLE'
            },
            floating: true,
            hidden: true,
            ownerCt: me.ownerCt,
            cls: me.el.up('.' + menuCls) ? menuCls : '',
            store: me.store,
            displayField: me.displayField,
            focusOnToFront: false,
	    height: me.computeHeight(),
            pageSize: me.pageSize
        }, me.listConfig, me.defaultListConfig);

	// NOTE: we simply use a grid panel
        //picker = me.picker = Ext.create('Ext.view.BoundList', opts);
	picker = me.picker = Ext.create('Ext.grid.Panel', opts);

	// pass getNode() to the view
	picker.getNode = function() {
	    picker.getView().getNode(arguments);
	};

        me.mon(picker, {
            itemclick: me.onItemClick,
            refresh: me.onListRefresh,
	    show: function() {
		picker.setHeight(me.computeHeight());
		me.syncSelection();
	    },
            scope: me
        });

        me.mon(picker.getSelectionModel(), 'selectionchange', me.onListSelectionChange, me);

        return picker;
    },

    initComponent: function() {
	var me = this;

	if (me.initialConfig.editable === undefined) {
	    me.editable = false;
	}

	Ext.apply(me, {
	    queryMode: 'local',
	    matchFieldWidth: false
	});

	Ext.applyIf(me, { value: ''}); // hack: avoid ExtJS validate() bug

	Ext.applyIf(me.listConfig, { width: 400 });

        me.callParent();

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

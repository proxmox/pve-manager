Ext.define('PVE.form.ComboGrid', {
    extend: 'Ext.form.field.ComboBox',
    alias: ['widget.PVE.form.ComboGrid'],

    computeHeight: function() {
	var me = this;
	var lh = PVE.Utils.gridLineHeigh();
	var count = me.store.getCount();
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

	Ext.apply(me, {
	    queryMode: 'local',
	    editable: false,
	    matchFieldWidth: false
	});

	Ext.applyIf(me, { value: ''}); // hack: avoid ExtJS validate() bug

	Ext.applyIf(me.listConfig, { width: 400 });

        me.callParent();

	me.store.on('beforeload', function() {
	    var form = me.up('form');
	    if (form) {
		form.setLoading(true, true);
	    }
	});

	// hack: autoSelect does not work
	me.store.on('load', function(store, r, success, o) {
	    var form = me.up('form');
	    if (form) {
		form.setLoading(false);
	    }
	    if (success) {
		me.clearInvalid();
		var def = me.getValue();
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
			me.setValue('', true);
		    }
		}
	    }
	});
    }
});

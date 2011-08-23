Ext.define('PVE.form.ComboGrid', {
    extend: 'Ext.form.ComboBox',
    requires: [
	'Ext.grid.Panel',
	'PVE.Utils'
    ],
    alias: ['widget.PVE.form.ComboGrid'],

    computeHeight: function() {
	var me = this;
	var lh = PVE.Utils.gridLineHeigh();
	var count = me.store.getCount();
	return (count > 10) ? 10*lh : 26+count*lh;
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
	    },
            scope: me
        });

        me.mon(picker.getSelectionModel(), {
            selectionChange: me.onListSelectionChange,
            scope: me
        });

        return picker;
    },

    initComponent: function() {
	var me = this;

	Ext.apply(me, {
	    queryMode: 'local',
	    editable: false,
	    matchFieldWidth: false
	});

	Ext.applyIf(me.listConfig, { width: 400 });

        me.callParent();

	me.store.on('beforeload', function() {
	    me.up('form').setLoading(true, true);
	});

	// hack: autoSelect does not work
	me.store.on('load', function(store, r, success, o) {
	    if (success) {
		var def = me.getValue();
		if (!def || !store.findRecord(me.valueField, def)) {
		    var rec = me.store.first();
		    if (me.autoSelect && rec && rec.data) {
			def = rec.data[me.valueField];
			me.setValue(def);
		    } else {
			me.setValue('');
		    }
		}
	    }
	    me.up('form').setLoading(false);
	});
    }
});
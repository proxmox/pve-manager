// Debounced search field for record stores. Set `targetStore` to auto-manage an Ext.util.Filter
// on it; otherwise listen to 'searchchange' (field, lowercased-query) and drive the filter shape
// yourself. Programmatic setValue cancels the pending debounce so resets take effect synchronously.
Ext.define('PVE.form.RecordSearchField', {
    extend: 'Proxmox.form.field.Textfield',
    alias: 'widget.pveRecordSearchField',

    width: 200,
    enableKeyEvents: true,
    submitValue: false,

    config: {
        searchFields: [],
        filterId: 'record-search',
    },

    // Not in `config:` because the auto-generated setter would fire before
    // `initComponent` creates `searchFilter`.
    targetStore: null,

    initComponent: function () {
        let me = this;
        let initialStore = me.targetStore;
        me.targetStore = null;
        me.searchFilter = new Ext.util.Filter({
            id: me.getFilterId(),
            filterFn: (rec) => me.matchesRecord(rec),
        });
        me.searchTask = new Ext.util.DelayedTask(me.applySearch, me);
        me.on('change', () => me.searchTask.delay(500));
        me.on('destroy', () => me.searchTask.cancel());
        me.callParent();
        if (initialStore) {
            me.setTargetStore(initialStore);
        }
    },

    setValue: function (value) {
        let me = this;
        let ret = me.callParent([value]);
        me.searchTask.cancel();
        me.applySearch();
        return ret;
    },

    setTargetStore: function (store) {
        let me = this;
        let prev = me.targetStore;
        if (prev && prev !== store && !prev.destroyed) {
            prev.removeFilter(me.searchFilter);
        }
        me.targetStore = store;
        me.applySearch();
    },

    matchesRecord: function (record) {
        return PVE.form.RecordSearchField.matches(
            record,
            (this.getValue() ?? '').toLowerCase(),
            this.getSearchFields(),
        );
    },

    statics: {
        matches: function (record, query, fields) {
            if (!query) {
                return true;
            }
            for (const field of fields) {
                let value = record.get(field);
                if (
                    value !== undefined &&
                    value !== null &&
                    value.toString().toLowerCase().includes(query)
                ) {
                    return true;
                }
            }
            return false;
        },
    },

    privates: {
        applySearch: function () {
            let me = this;
            let store = me.targetStore;
            let query = (me.getValue() ?? '').toLowerCase();
            me.fireEvent('searchchange', me, query);
            if (!store || store.destroyed) {
                return;
            }
            if (query) {
                store.addFilter(me.searchFilter);
            } else {
                store.removeFilter(me.searchFilter);
            }
        },
    },
});
